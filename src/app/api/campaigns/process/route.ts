import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { decryptCredential } from "@/lib/crypto";
import { sendWhatsAppTemplateMessage } from "@/lib/whatsapp";

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
    const { campaignId, action = "start" } = body;

    if (!campaignId) {
      return NextResponse.json({ error: "campaignId is required" }, { status: 400 });
    }

    // 1. Fetch Campaign
    const { data: campaign, error: campErr } = await supabase
      .from("campaigns")
      .select("*, template:message_templates(*)")
      .eq("id", campaignId)
      .eq("user_id", user.id)
      .single();

    if (campErr || !campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    // Handle pause or cancel action
    if (action === "pause") {
      await supabase.from("campaigns").update({ status: "paused" }).eq("id", campaignId);
      return NextResponse.json({ success: true, status: "paused" });
    }

    if (action === "cancel") {
      await supabase.from("campaigns").update({ status: "canceled" }).eq("id", campaignId);
      return NextResponse.json({ success: true, status: "canceled" });
    }

    // 2. Fetch connected WhatsApp Account
    const { data: waAccount } = await supabase
      .from("whatsapp_accounts")
      .select("*")
      .eq("id", campaign.whatsapp_account_id)
      .single();

    if (!waAccount || waAccount.status !== "connected") {
      return NextResponse.json(
        { error: "WhatsApp account is disconnected. Please reconnect before running campaigns." },
        { status: 400 }
      );
    }

    let accessToken = "";
    try {
      accessToken = decryptCredential({
        ciphertext: waAccount.encrypted_access_token,
        iv: waAccount.access_token_iv,
        tag: waAccount.access_token_tag,
      });
    } catch {
      return NextResponse.json({ error: "Credential decryption failed" }, { status: 500 });
    }

    // 3. Mark campaign as running
    await supabase.from("campaigns").update({ status: "running" }).eq("id", campaignId);

    // 4. Fetch queued recipients for this campaign
    const { data: queuedRecipients } = await supabase
      .from("campaign_recipients")
      .select("*, contact:contacts(*)")
      .eq("campaign_id", campaignId)
      .eq("status", "queued")
      .limit(50); // Safe batch size per invocation

    if (!queuedRecipients || queuedRecipients.length === 0) {
      await supabase.from("campaigns").update({ status: "completed" }).eq("id", campaignId);
      return NextResponse.json({ success: true, message: "Campaign has no remaining queued recipients", completed: true });
    }

    const templateName = campaign.template?.name;
    const languageCode = campaign.template?.language || "en_US";

    let sentBatchCount = 0;
    let failedBatchCount = 0;
    let suppressedBatchCount = 0;

    // Process each recipient with rate-limiting delay
    for (const item of queuedRecipients) {
      const contact = item.contact;

      // Consent & Opt-Out Suppression check
      if (!contact || contact.consent_status === "opted_out") {
        await supabase
          .from("campaign_recipients")
          .update({
            status: "suppressed_optout",
            error_message: "Suppressed: Contact has opted out of messaging.",
          })
          .eq("id", item.id);

        suppressedBatchCount++;
        continue;
      }

      // Format template components with personalization variables
      const templateVars = campaign.template_variables || {};
      const bodyParameters: Array<{ type: string; text: string }> = [];

      // Replace common variables (e.g. {{name}} or {{1}})
      Object.keys(templateVars).forEach((key) => {
        let val = templateVars[key] || "";
        if (val === "{{name}}") val = contact.name || "Customer";
        if (val === "{{phone}}") val = contact.phone_number;
        bodyParameters.push({ type: "text", text: val });
      });

      const components = bodyParameters.length > 0
        ? [{ type: "body", parameters: bodyParameters }]
        : [];

      // Send approved WhatsApp template
      const sendRes = await sendWhatsAppTemplateMessage({
        phoneNumberId: waAccount.phone_number_id,
        accessToken,
        to: item.phone_number,
        templateName: templateName || "hello_world",
        languageCode,
        components,
      });

      if (sendRes.success) {
        await supabase
          .from("campaign_recipients")
          .update({
            status: "sent",
            whatsapp_message_id: sendRes.messageId,
            sent_at: new Date().toISOString(),
          })
          .eq("id", item.id);

        // Also record in messages table
        const { data: conv } = await supabase
          .from("conversations")
          .select("id")
          .eq("user_id", user.id)
          .eq("contact_id", contact.id)
          .maybeSingle();

        let convId = conv?.id;
        if (!convId) {
          const { data: newConv } = await supabase
            .from("conversations")
            .insert({
              user_id: user.id,
              contact_id: contact.id,
              whatsapp_account_id: waAccount.id,
              status: "open",
            })
            .select("id")
            .single();
          convId = newConv?.id;
        }

        if (convId) {
          await supabase.from("messages").insert({
            conversation_id: convId,
            user_id: user.id,
            contact_id: contact.id,
            whatsapp_message_id: sendRes.messageId,
            direction: "outbound",
            sender_type: "system_campaign",
            message_type: "template",
            content: `[Campaign: ${campaign.name}] Template: ${templateName}`,
            template_name: templateName,
            status: "sent",
          });
        }

        sentBatchCount++;
      } else {
        const errorText =
          typeof sendRes.error === "string"
            ? sendRes.error
            : sendRes.error?.message || "Failed to deliver template";

        await supabase
          .from("campaign_recipients")
          .update({
            status: "failed",
            error_message: errorText,
          })
          .eq("id", item.id);

        failedBatchCount++;
      }

      // Polite pacing: 100ms delay between API calls to prevent burst limits
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Refresh aggregated campaign stats
    const { count: totalSent } = await supabase
      .from("campaign_recipients")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .eq("status", "sent");

    const { count: totalFailed } = await supabase
      .from("campaign_recipients")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .eq("status", "failed");

    const { count: totalSuppressed } = await supabase
      .from("campaign_recipients")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .eq("status", "suppressed_optout");

    const { count: remainingQueued } = await supabase
      .from("campaign_recipients")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .eq("status", "queued");

    const isCompleted = (remainingQueued || 0) === 0;

    await supabase
      .from("campaigns")
      .update({
        sent_count: totalSent || 0,
        failed_count: totalFailed || 0,
        opted_out_count: totalSuppressed || 0,
        status: isCompleted ? "completed" : "running",
        updated_at: new Date().toISOString(),
      })
      .eq("id", campaignId);

    return NextResponse.json({
      success: true,
      batchResults: {
        sent: sentBatchCount,
        failed: failedBatchCount,
        suppressed: suppressedBatchCount,
        remainingQueued,
        isCompleted,
      },
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
