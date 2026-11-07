import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { testWhatsAppConnection } from "@/lib/whatsapp";
import { encryptCredential, decryptCredential } from "@/lib/crypto";
import { getEnvWhatsAppConfig } from "@/lib/config";

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

    const body = await req.json().catch(() => ({}));
    let {
      phoneNumberId,
      wabaId,
      appSecret,
      accessToken,
      verifyToken,
      save = false,
    } = body;

    // Fallback to DB or Environment variables if not provided in body
    if (!phoneNumberId || !accessToken) {
      const { data: waAccount } = await supabase
        .from("whatsapp_accounts")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (waAccount) {
        phoneNumberId = waAccount.phone_number_id;
        try {
          accessToken = decryptCredential({
            ciphertext: waAccount.encrypted_access_token,
            iv: waAccount.access_token_iv,
            tag: waAccount.access_token_tag,
          });
        } catch {
          // ignore
        }
      }

      if (!phoneNumberId || !accessToken) {
        const envConfig = getEnvWhatsAppConfig();
        phoneNumberId = envConfig.phoneNumberId;
        accessToken = envConfig.accessToken;
      }
    }

    if (!phoneNumberId || !accessToken) {
      return NextResponse.json(
        { error: "Phone Number ID and System User Access Token are required" },
        { status: 400 }
      );
    }

    // 1. Test WhatsApp Cloud API Connectivity
    const testResult = await testWhatsAppConnection(phoneNumberId.trim(), accessToken.trim());

    if (!testResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: testResult.error || "Connection failed. Please check your credentials.",
        },
        { status: 400 }
      );
    }

    const profileData = testResult.data;

    // 2. If 'save' is requested, securely encrypt credentials and store in DB
    if (save) {
      if (!appSecret || !wabaId || !verifyToken) {
        return NextResponse.json(
          { error: "WABA ID, App Secret, and Verify Token are required to save credentials" },
          { status: 400 }
        );
      }

      // Encrypt sensitive secrets with AES-256-GCM
      const encryptedSecret = encryptCredential(appSecret.trim());
      const encryptedToken = encryptCredential(accessToken.trim());

      const payload = {
        user_id: user.id,
        phone_number_id: phoneNumberId.trim(),
        waba_id: wabaId.trim(),
        display_phone_number: profileData?.display_phone_number || null,
        verified_name: profileData?.verified_name || null,
        quality_rating: profileData?.quality_rating || "UNKNOWN",
        status: "connected",
        verify_token: verifyToken.trim(),
        encrypted_app_secret: encryptedSecret.ciphertext,
        app_secret_iv: encryptedSecret.iv,
        app_secret_tag: encryptedSecret.tag,
        encrypted_access_token: encryptedToken.ciphertext,
        access_token_iv: encryptedToken.iv,
        access_token_tag: encryptedToken.tag,
        last_synced_at: new Date().toISOString(),
        error_message: null,
      };

      const { data: savedAccount, error: saveErr } = await supabase
        .from("whatsapp_accounts")
        .upsert(payload, { onConflict: "user_id,phone_number_id" })
        .select("id, phone_number_id, waba_id, display_phone_number, verified_name, quality_rating, status, verify_token")
        .single();

      if (saveErr) {
        console.error("Save WhatsApp account error:", saveErr);
        return NextResponse.json({ error: saveErr.message }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        account: savedAccount,
        profile: profileData,
      });
    }

    return NextResponse.json({
      success: true,
      profile: profileData,
    });
  } catch (err: unknown) {
    console.error("Test connection error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}
