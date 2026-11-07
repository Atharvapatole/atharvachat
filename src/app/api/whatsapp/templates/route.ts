import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decryptCredential } from "@/lib/crypto";
import { fetchWhatsAppTemplates } from "@/lib/whatsapp";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const sync = searchParams.get("sync") === "true";

    // 1. Fetch connected account
    const { data: waAccount } = await supabase
      .from("whatsapp_accounts")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "connected")
      .single();

    if (!waAccount) {
      return NextResponse.json({ templates: [] });
    }

    // If sync requested, query Meta Graph API and sync into DB
    if (sync) {
      let accessToken = "";
      try {
        accessToken = decryptCredential({
          ciphertext: waAccount.encrypted_access_token,
          iv: waAccount.access_token_iv,
          tag: waAccount.access_token_tag,
        });
      } catch {
        return NextResponse.json({ error: "Failed to decrypt credentials" }, { status: 500 });
      }

      const metaRes = await fetchWhatsAppTemplates(waAccount.waba_id, accessToken);
      if (metaRes.success && metaRes.templates) {
        for (const tpl of metaRes.templates) {
          const bodyComp = (tpl.components as any[])?.find((c) => c.type === "BODY");
          const headerComp = (tpl.components as any[])?.find((c) => c.type === "HEADER");
          const footerComp = (tpl.components as any[])?.find((c) => c.type === "FOOTER");
          const buttonsComp = (tpl.components as any[])?.find((c) => c.type === "BUTTONS");

          const bodyText = bodyComp?.text || "";
          const varCount = (bodyText.match(/{{[0-9]+}}/g) || []).length;

          await supabase.from("message_templates").upsert(
            {
              user_id: user.id,
              whatsapp_account_id: waAccount.id,
              name: tpl.name,
              language: tpl.language || "en_US",
              category: tpl.category || "MARKETING",
              status: tpl.status || "APPROVED",
              body_text: bodyText,
              header_type: headerComp?.format || null,
              footer_text: footerComp?.text || null,
              buttons: buttonsComp?.buttons || [],
              variable_count: varCount,
            },
            { onConflict: "user_id,name,language" }
          );
        }
      }
    }

    // Retrieve from DB
    const { data: templates } = await supabase
      .from("message_templates")
      .select("*")
      .eq("user_id", user.id)
      .order("name", { ascending: true });

    return NextResponse.json({ templates: templates || [] });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
