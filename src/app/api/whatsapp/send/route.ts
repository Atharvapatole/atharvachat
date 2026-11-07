import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decryptCredential } from "@/lib/crypto";
import { sendWhatsAppTextMessage, sendWhatsAppTemplateMessage } from "@/lib/whatsapp";
import { cleanPhoneNumber } from "@/lib/utils";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

    // 2. Fetch connected WhatsApp Account
    const { data: waAccount, error: accErr } = await supabase
      .from("whatsapp_accounts")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "connected")
      .single();

    if (accErr || !waAccount) {
      return NextResponse.json(
        { error: "No active WhatsApp account connected. Please connect in WhatsApp Connection page." },
        { status: 400 }
      );
    }

    // 3. Decrypt Permanent Access Token
    let accessToken = "";
    try {
      accessToken = decryptCredential({
        ciphertext: waAccount.encrypted_access_token,
        iv: waAccount.access_token_iv,
        tag: waAccount.access_token_tag,
      });
    } catch {
      return NextResponse.json(
        { error: "Failed to decrypt WhatsApp credentials. Please re-enter them in Connection settings." },
        { status: 500 }
      );
    }

    // 4. Verify 24-hour customer window for free-form messages
    if (messageType === "text") {
      let isWithin24Hours = false;

      if (conversationId) {
        const { data: conv } = await supabase
          .from("conversations")
          .select("last_incoming_message_at")
          .eq("id", conversationId)
          .single();

        if (conv?.last_incoming_message_at) {
          const lastIncoming = new Date(conv.last_incoming_message_at).getTime();
          const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
          if (lastIncoming > twentyFourHoursAgo) {
            isWithin24Hours = true;
          }
        }
      }

      // If outside 24h window, Meta will reject free-form messages.
      // We will attempt sending anyway, and if Meta returns 131047, we display the helpful error.
    }

    // 5. Send message via WhatsApp Cloud API
    let sendResult;
    const recipientPhone = cleanPhoneNumber(contact.phone_number);

    if (messageType === "template" && templateName) {
      sendResult = await sendWhatsAppTemplateMessage({
        phoneNumberId: waAccount.phone_number_id,
        accessToken,
        to: recipientPhone,
        templateName,
        languageCode,
        components: templateData?.components || [],
      });
    } else {
      sendResult = await sendWhatsAppTextMessage({
        phoneNumberId: waAccount.phone_number_id,
        accessToken,
        to: recipientPhone,
        text,
      });
    }

    if (!sendResult.success) {
      const errorMsg =
        typeof sendResult.error === "string"
          ? sendResult.error
          : sendResult.error?.message || "Failed to send message";

      return NextResponse.json({ error: errorMsg }, { status: 400 });
    }

    // 6. Ensure Conversation exists
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
            whatsapp_account_id: waAccount.id,
            status: "open",
            ai_status: "active",
          })
          .select("id")
          .single();
        activeConvId = newConv?.id;
      }
    }

    // 7. Human Takeover: When a human sends a message, temporarily pause AI for this conversation
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

    // 8. Record outgoing message in database
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
