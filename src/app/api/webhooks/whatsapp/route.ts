import { NextRequest, NextResponse, after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyMetaWebhookSignature, decryptCredential } from "@/lib/crypto";
import { processAiResponseForMessage } from "@/lib/ai-engine";
import { cleanPhoneNumber } from "@/lib/utils";
import { getEnvWhatsAppConfig } from "@/lib/config";

/**
 * GET: Meta Webhook Verification Handshake
 * Meta sends: hub.mode, hub.verify_token, hub.challenge
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode !== "subscribe" || !token || !challenge) {
    return new NextResponse("Bad Request: Invalid verification parameters", { status: 400 });
  }

  // 1. Check against default fallback token in env
  const envConfig = getEnvWhatsAppConfig();
  if (envConfig.verifyToken && token === envConfig.verifyToken) {
    return new NextResponse(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  // 2. Query database for any registered WhatsApp accounts with this verify token
  try {
    const supabase = createAdminClient();
    const { data: accounts } = await supabase
      .from("whatsapp_accounts")
      .select("id, verify_token")
      .eq("verify_token", token)
      .limit(1);

    if (accounts && accounts.length > 0) {
      return new NextResponse(challenge, {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    }
  } catch (err) {
    console.error("Error verifying webhook token with DB:", err);
  }

  return new NextResponse("Forbidden: Invalid verify token", { status: 403 });
}

/**
 * POST: Incoming WhatsApp Cloud API Webhook Events
 * Handles incoming messages and message status updates (sent, delivered, read, failed)
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256");

  let parsedPayload: any;
  try {
    parsedPayload = JSON.parse(rawBody);
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 });
  }

  const supabase = createAdminClient();

  // Record raw webhook for audit trail
  try {
    await supabase.from("webhook_events").insert({
      event_type: "whatsapp_cloud_api",
      payload: parsedPayload,
      status: "received",
    });
  } catch (auditErr) {
    console.warn("Could not insert webhook event audit:", auditErr);
  }

  // Verify object type
  if (parsedPayload.object !== "whatsapp_business_account") {
    return NextResponse.json({ status: "ignored" }, { status: 200 });
  }

  const entries = parsedPayload.entry || [];
  const backgroundTasks: Array<() => Promise<void>> = [];

  for (const entry of entries) {
    const changes = entry.changes || [];
    for (const change of changes) {
      if (change.field !== "messages") continue;

      const value = change.value;
      if (!value) continue;

      const metadata = value.metadata;
      const phoneNumberId = metadata?.phone_number_id;
      if (!phoneNumberId) continue;

      // Find WhatsApp account in DB or fallback to environment credentials
      const { data: waAccount } = await supabase
        .from("whatsapp_accounts")
        .select("*")
        .eq("phone_number_id", phoneNumberId)
        .maybeSingle();

      const envConfig = getEnvWhatsAppConfig();
      let appSecret = envConfig.appSecret;
      let userId = waAccount?.user_id;

      if (waAccount) {
        try {
          appSecret = decryptCredential({
            ciphertext: waAccount.encrypted_app_secret,
            iv: waAccount.app_secret_iv,
            tag: waAccount.app_secret_tag,
          });
        } catch (decryptErr) {
          console.error("App secret decryption error:", decryptErr);
        }
      }

      // If still no user_id, lookup primary user in profiles table
      if (!userId) {
        const { data: firstProfile } = await supabase.from("profiles").select("id").limit(1).maybeSingle();
        userId = firstProfile?.id;
      }

      // Validate cryptographic signature
      if (appSecret) {
        const isSignatureValid = verifyMetaWebhookSignature(rawBody, signature, appSecret);
        if (!isSignatureValid) {
          console.error("Webhook signature verification failed for phone_number_id:", phoneNumberId);
          return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
        }
      } else {
        console.warn("No App Secret found for signature verification. Proceeding cautiously.");
      }

      if (!userId) {
        console.warn("No associated user found to assign incoming WhatsApp message.");
        continue;
      }

      // 1. Process Status Updates (sent, delivered, read, failed)
      const statuses = value.statuses || [];
      for (const statusObj of statuses) {
        const messageId = statusObj.id;
        const newStatus = statusObj.status; // sent, delivered, read, failed

        const updateData: Record<string, any> = {
          status: newStatus,
          updated_at: new Date().toISOString(),
        };

        if (statusObj.errors && statusObj.errors.length > 0) {
          const firstErr = statusObj.errors[0];
          updateData.error_code = String(firstErr.code);
          updateData.error_message = firstErr.title || firstErr.message;
        }

        await supabase
          .from("messages")
          .update(updateData)
          .eq("whatsapp_message_id", messageId);

        await supabase
          .from("campaign_recipients")
          .update({
            status: newStatus,
            error_message: updateData.error_message,
          })
          .eq("whatsapp_message_id", messageId);
      }

      // 2. Process Incoming Messages
      const incomingMessages = value.messages || [];
      const contactsMeta = value.contacts || [];

      for (const msg of incomingMessages) {
        const messageId = msg.id;
        const senderPhone = cleanPhoneNumber(msg.from);
        const contactMeta = contactsMeta.find((c: any) => cleanPhoneNumber(c.wa_id) === senderPhone);
        const contactProfileName = contactMeta?.profile?.name || null;

        let messageText = "";
        let messageType = "text";

        if (msg.type === "text") {
          messageText = msg.text?.body || "";
        } else if (msg.type === "button") {
          messageText = msg.button?.text || "";
        } else if (msg.type === "interactive") {
          messageText =
            msg.interactive?.button_reply?.title ||
            msg.interactive?.list_reply?.title ||
            "Interactive response";
        } else if (msg.type === "image") {
          messageType = "image";
          messageText = msg.image?.caption || "[Image]";
        } else if (msg.type === "audio") {
          messageType = "audio";
          messageText = "[Audio Message]";
        } else if (msg.type === "document") {
          messageType = "document";
          messageText = msg.document?.caption || `[Document: ${msg.document?.filename || "file"}]`;
        } else {
          messageText = `[${msg.type} message]`;
        }

        // Auto-create or fetch Contact
        const { data: existingContact } = await supabase
          .from("contacts")
          .select("*")
          .eq("user_id", userId)
          .eq("phone_number", senderPhone)
          .maybeSingle();

        let contactId = existingContact?.id;

        if (!existingContact) {
          const { data: newContact, error: contactErr } = await supabase
            .from("contacts")
            .insert({
              user_id: userId,
              phone_number: senderPhone,
              name: contactProfileName,
              consent_status: "opted_in",
              ai_enabled: true,
            })
            .select()
            .single();

          if (contactErr || !newContact) {
            console.error("Error creating contact on incoming webhook:", contactErr);
            continue;
          }
          contactId = newContact.id;
        } else if (contactProfileName && !existingContact.name) {
          await supabase
            .from("contacts")
            .update({ name: contactProfileName })
            .eq("id", existingContact.id);
        }

        // Auto-create or fetch Conversation
        const { data: existingConv } = await supabase
          .from("conversations")
          .select("*")
          .eq("user_id", userId)
          .eq("contact_id", contactId)
          .maybeSingle();

        let conversationId = existingConv?.id;

        if (!existingConv) {
          const { data: newConv, error: convErr } = await supabase
            .from("conversations")
            .insert({
              user_id: userId,
              contact_id: contactId,
              whatsapp_account_id: waAccount?.id || null,
              status: "open",
              ai_status: "active",
              last_message_at: new Date().toISOString(),
              last_incoming_message_at: new Date().toISOString(),
              unread_count: 1,
            })
            .select()
            .single();

          if (convErr || !newConv) {
            console.error("Error creating conversation on incoming webhook:", convErr);
            continue;
          }
          conversationId = newConv.id;
        } else {
          await supabase
            .from("conversations")
            .update({
              last_message_at: new Date().toISOString(),
              last_incoming_message_at: new Date().toISOString(),
              unread_count: (existingConv.unread_count || 0) + 1,
            })
            .eq("id", existingConv.id);
        }

        // Deduplication: Avoid duplicate message inserts on Meta retry
        const { data: existingMsg } = await supabase
          .from("messages")
          .select("id")
          .eq("whatsapp_message_id", messageId)
          .maybeSingle();

        if (existingMsg) {
          continue;
        }

        // Insert incoming message
        await supabase.from("messages").insert({
          conversation_id: conversationId,
          user_id: userId,
          contact_id: contactId,
          whatsapp_message_id: messageId,
          direction: "inbound",
          sender_type: "contact",
          message_type: messageType,
          content: messageText,
          status: "delivered",
          raw_payload: msg,
        });

        // Queue Atharva AI Assistant response in background without blocking Meta webhook response
        const currentUserId = userId;
        const currentContactId = contactId;
        const currentConversationId = conversationId;
        backgroundTasks.push(async () => {
          try {
            await processAiResponseForMessage({
              supabase,
              userId: currentUserId,
              contactId: currentContactId,
              conversationId: currentConversationId,
              incomingText: messageText,
              whatsappMessageId: messageId,
            });
          } catch (aiErr) {
            console.error("AI response processing error in background:", aiErr);
          }
        });
      }
    }
  }

  // Execute background AI tasks using Next.js 15 `after` for reliable serverless execution
  if (backgroundTasks.length > 0) {
    after(async () => {
      for (const task of backgroundTasks) {
        await task();
      }
    });
  }

  return NextResponse.json({ status: "success" }, { status: 200 });
}
