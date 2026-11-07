import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { decryptCredential } from "@/lib/crypto";
import { sendWhatsAppTextMessage, sendWhatsAppTemplateMessage } from "@/lib/whatsapp";
import { cleanPhoneNumber } from "@/lib/utils";
import { getEnvWhatsAppConfig } from "@/lib/config";

export async function POST(req: NextRequest) {
  try {
    const { user, supabase, error: authError } = await getAuthenticatedUser(req);

    if (authError || !user) {
      return NextResponse.json(
        { error: "Supabase authentication required. Please log in to your Atharva Chat account." },
        { status: 401 }
      );
    }

    const body = await req.json();
    const {
      conversationId,
      contactId,
      text,
      messageType = "text",
      templateName,
      templateData,
      languageCode = "en_US",
    } = body;

    if (!contactId || (!text && !templateName)) {
      return NextResponse.json(
        { error: "Missing required fields (contactId, text or templateName)" },
        { status: 400 }
      );
    }

    // 1. Fetch Contact & verify consent/opt-out status
    const { data: contact, error: contactErr } = await supabase
      .from("contacts")
      .select("*")
      .eq("id", contactId)
      .eq("user_id", user.id)
      .single();

    if (contactErr || !contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    if (contact.consent_status === "opted_out") {
      return NextResponse.json(
        { error: "Cannot send message: Contact has explicitly opted out of messaging." },
        { status: 400 }
      );
    }

    // 2. Resolve WhatsApp Account credentials (DB or Environment Variables)
    const { data: waAccount } = await supabase
      .from("whatsapp_accounts")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "connected")
      .maybeSingle();

    const envConfig = getEnvWhatsAppConfig();
    let phoneNumberId = waAccount?.phone_number_id || envConfig.phoneNumberId;
    let accessToken = "";

    if (waAccount) {
      try {
        accessToken = decryptCredential({
          ciphertext: waAccount.encrypted_access_token,
          iv: waAccount.access_token_iv,
          tag: waAccount.access_token_tag,
        });
      } catch {
        console.error("Failed to decrypt DB WhatsApp credentials.");
      }
    }

    if (!accessToken && envConfig.accessToken) {
      accessToken = envConfig.accessToken;
    }

    if (!phoneNumberId || !accessToken) {
      return NextResponse.json(
        {
          error:
            "No active WhatsApp Cloud API credentials configured. Please connect your credentials on the WhatsApp Connection page or configure Vercel environment variables.",
        },
        { status: 400 }
      );
    }

    // 3. Verify 24-hour customer window for free-form messages
    if (messageType === "text" && conversationId) {
      const { data: conv } = await supabase
        .from("conversations")
        .select("last_incoming_message_at")
        .eq("id", conversationId)
        .single();

      if (!conv?.last_incoming_message_at) {
        // Customer has never messaged first
        return NextResponse.json(
          {
            error:
              "WhatsApp Policy: The recipient has not sent an inbound message yet. Meta requires an approved WhatsApp Message Template to initiate a new conversation.",
            requiresTemplate: true,
          },
          { status: 400 }
        );
      }

      const lastIncoming = new Date(conv.last_incoming_message_at).getTime();
      const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
      if (lastIncoming < twentyFourHoursAgo) {
        return NextResponse.json(
          {
            error:
              "24-Hour WhatsApp Service Window Expired: Over 24 hours have passed since the customer's last message. WhatsApp policy strictly requires sending an approved Message Template to re-open this conversation.",
            requiresTemplate: true,
          },
          { status: 400 }
        );
      }
    }

    // 4. Send message via WhatsApp Cloud API
    let sendResult;
    const recipientPhone = cleanPhoneNumber(contact.phone_number);

    if (messageType === "template" && templateName) {
      sendResult = await sendWhatsAppTemplateMessage({
        phoneNumberId,
        accessToken,
        to: recipientPhone,
        templateName,
        languageCode,
        components: templateData?.components || [],
      });
    } else {
      sendResult = await sendWhatsAppTextMessage({
        phoneNumberId,
        accessToken,
        to: recipientPhone,
        text,
      });
    }

    if (!sendResult.success) {
      const errorMsg =
        typeof sendResult.error === "string"
          ? sendResult.error
          : sendResult.error?.message || "Failed to send WhatsApp message via Meta Cloud API";

      return NextResponse.json({ error: errorMsg }, { status: 400 });
    }

    // 5. Ensure Conversation exists
    let activeConvId = conversationId;
    if (!activeConvId) {
      const { data: conv } = await supabase
        .from("conversations")
        .select("id")
        .eq("user_id", user.id)
        .eq("contact_id", contactId)
        .maybeSingle();

      if (conv) {
        activeConvId = conv.id;
      } else {
        const { data: newConv } = await supabase
          .from("conversations")
          .insert({
            user_id: user.id,
            contact_id: contactId,
            whatsapp_account_id: waAccount?.id || null,
            status: "open",
            ai_status: "active",
            last_message_at: new Date().toISOString(),
          })
          .select("id")
          .single();
        activeConvId = newConv?.id;
      }
    }

    // 6. Human Takeover: When a human sends a message, temporarily pause AI for this conversation
    const { data: aiSettings } = await supabase
      .from("ai_settings")
      .select("pause_duration_minutes")
      .eq("user_id", user.id)
      .maybeSingle();

    const pauseMinutes = aiSettings?.pause_duration_minutes || 30;
    const pauseUntil = new Date(Date.now() + pauseMinutes * 60 * 1000).toISOString();

    await supabase
      .from("conversations")
      .update({
        ai_status: "paused_by_user",
        ai_paused_until: pauseUntil,
        last_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", activeConvId);

    // 7. Record outgoing message in database
    const { data: savedMsg, error: msgErr } = await supabase
      .from("messages")
      .insert({
        conversation_id: activeConvId,
        user_id: user.id,
        contact_id: contactId,
        whatsapp_message_id: sendResult.messageId,
        direction: "outbound",
        sender_type: "human_user",
        message_type: messageType,
        content: text || `[Template: ${templateName}]`,
        template_name: templateName || null,
        template_data: templateData || null,
        status: "sent",
      })
      .select()
      .single();

    if (msgErr) {
      console.error("Error saving outbound message:", msgErr);
    }

    return NextResponse.json({
      success: true,
      message: savedMsg,
      whatsappMessageId: sendResult.messageId,
    });
  } catch (err: unknown) {
    console.error("API send error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}
