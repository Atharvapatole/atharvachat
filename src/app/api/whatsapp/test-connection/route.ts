import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { verifyWhatsAppCredentials } from "@/lib/whatsapp";
import { encryptCredential, decryptCredential } from "@/lib/crypto";
import { getEnvWhatsAppConfig } from "@/lib/config";

/**
 * GET /api/whatsapp/test-connection
 * Fetches the current WhatsApp connection status and profile details for the authenticated user.
 * Never exposes raw access tokens or App Secrets to the frontend.
 */
export async function GET(req: NextRequest) {
  try {
    const { user, supabase, error: authError } = await getAuthenticatedUser(req);

    if (authError || !user) {
      return NextResponse.json(
        {
          success: false,
          error: "Supabase authentication required. Please log in to your Atharva Chat account.",
          code: "AUTH_REQUIRED",
        },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const testLive = searchParams.get("test") === "true";

    // 1. Fetch user's saved WhatsApp account
    const { data: waAccount, error: dbError } = await supabase
      .from("whatsapp_accounts")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (dbError) {
      return NextResponse.json(
        {
          success: false,
          error: `Supabase database error: ${dbError.message}`,
          code: "DB_ERROR",
        },
        { status: 500 }
      );
    }

    const envConfig = getEnvWhatsAppConfig();
    const phoneNumberId = waAccount?.phone_number_id || envConfig.phoneNumberId || "";
    const wabaId = waAccount?.waba_id || envConfig.wabaId || "";
    const verifyToken = waAccount?.verify_token || envConfig.verifyToken || "";

    const hasStoredToken = Boolean(waAccount?.encrypted_access_token || envConfig.accessToken);
    const hasStoredSecret = Boolean(waAccount?.encrypted_app_secret || envConfig.appSecret);

    if (!phoneNumberId && !hasStoredToken) {
      return NextResponse.json({
        success: true,
        configured: false,
        status: "disconnected",
        verifyToken,
      });
    }

    // 2. If testLive is requested, decrypt and verify against Meta Graph API
    if (testLive && hasStoredToken && phoneNumberId) {
      let accessToken = "";
      if (waAccount?.encrypted_access_token) {
        try {
          accessToken = decryptCredential({
            ciphertext: waAccount.encrypted_access_token,
            iv: waAccount.access_token_iv,
            tag: waAccount.access_token_tag,
          });
        } catch {
          return NextResponse.json(
            {
              success: false,
              error: "Unable to decrypt stored credentials. Credential encryption key mismatch.",
              code: "DECRYPTION_FAILED",
            },
            { status: 500 }
          );
        }
      } else if (envConfig.accessToken) {
        accessToken = envConfig.accessToken;
      }

      if (accessToken) {
        const verifyResult = await verifyWhatsAppCredentials({
          phoneNumberId,
          accessToken,
          wabaId,
        });

        if (!verifyResult.success) {
          // Update status in DB to error
          if (waAccount) {
            await supabase
              .from("whatsapp_accounts")
              .update({
                status: "error",
                error_message: verifyResult.error,
                updated_at: new Date().toISOString(),
              })
              .eq("id", waAccount.id);
          }

          return NextResponse.json(
            {
              success: false,
              configured: true,
              status: "error",
              error: verifyResult.error,
              code: verifyResult.code,
              phoneNumberId,
              wabaId,
              verifyToken,
              hasAccessToken: true,
              hasAppSecret: hasStoredSecret,
            },
            { status: verifyResult.statusCode }
          );
        }

        // Update connected profile in DB
        if (waAccount && verifyResult.data) {
          await supabase
            .from("whatsapp_accounts")
            .update({
              status: "connected",
              display_phone_number: verifyResult.data.display_phone_number || waAccount.display_phone_number,
              verified_name: verifyResult.data.verified_name || waAccount.verified_name,
              quality_rating: verifyResult.data.quality_rating || waAccount.quality_rating,
              error_message: null,
              last_synced_at: new Date().toISOString(),
            })
            .eq("id", waAccount.id);
        }

        return NextResponse.json({
          success: true,
          configured: true,
          status: "connected",
          phoneNumberId,
          wabaId,
          verifyToken,
          hasAccessToken: true,
          hasAppSecret: hasStoredSecret,
          profile: verifyResult.data,
        });
      }
    }

    return NextResponse.json({
      success: true,
      configured: true,
      status: waAccount?.status || "disconnected",
      phoneNumberId,
      wabaId,
      verifyToken,
      hasAccessToken: hasStoredToken,
      hasAppSecret: hasStoredSecret,
      displayPhone: waAccount?.display_phone_number || null,
      verifiedName: waAccount?.verified_name || null,
      qualityRating: waAccount?.quality_rating || null,
      lastSyncedAt: waAccount?.last_synced_at || null,
      errorMessage: waAccount?.error_message || null,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Internal Server Error",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/whatsapp/test-connection
 * Tests WhatsApp credentials against Meta Graph API and optionally encrypts & stores them in Supabase.
 */
export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate user
    const { user, supabase, error: authError } = await getAuthenticatedUser(req);

    if (authError || !user) {
      return NextResponse.json(
        {
          success: false,
          error: "Supabase authentication required. Please log in to your Atharva Chat account.",
          code: "AUTH_REQUIRED",
        },
        { status: 401 }
      );
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

    phoneNumberId = typeof phoneNumberId === "string" ? phoneNumberId.trim() : "";
    wabaId = typeof wabaId === "string" ? wabaId.trim() : "";
    appSecret = typeof appSecret === "string" ? appSecret.trim() : "";
    accessToken = typeof accessToken === "string" ? accessToken.trim() : "";
    verifyToken = typeof verifyToken === "string" ? verifyToken.trim() : "";

    // 2. Fetch existing saved credentials from DB if any field is not provided
    const { data: waAccount, error: fetchErr } = await supabase
      .from("whatsapp_accounts")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (fetchErr) {
      return NextResponse.json(
        {
          success: false,
          error: `Supabase database error: ${fetchErr.message}`,
          code: "DB_ERROR",
        },
        { status: 500 }
      );
    }

    // Fall back to saved DB credentials if not passed in form
    if (!phoneNumberId && waAccount?.phone_number_id) {
      phoneNumberId = waAccount.phone_number_id;
    }
    if (!wabaId && waAccount?.waba_id) {
      wabaId = waAccount.waba_id;
    }
    if (!verifyToken && waAccount?.verify_token) {
      verifyToken = waAccount.verify_token;
    }

    // If access token was omitted, decrypt the stored token
    if (!accessToken && waAccount?.encrypted_access_token) {
      try {
        accessToken = decryptCredential({
          ciphertext: waAccount.encrypted_access_token,
          iv: waAccount.access_token_iv,
          tag: waAccount.access_token_tag,
        });
      } catch {
        return NextResponse.json(
          {
            success: false,
            error: "Unable to decrypt stored credentials. Credential encryption key mismatch or corrupted storage.",
            code: "DECRYPTION_FAILED",
          },
          { status: 500 }
        );
      }
    }

    // If app secret was omitted, decrypt the stored secret
    if (!appSecret && waAccount?.encrypted_app_secret) {
      try {
        appSecret = decryptCredential({
          ciphertext: waAccount.encrypted_app_secret,
          iv: waAccount.app_secret_iv,
          tag: waAccount.app_secret_tag,
        });
      } catch {
        // Can be ignored if only testing
      }
    }

    // Check Vercel environment variables fallback if still missing
    const envConfig = getEnvWhatsAppConfig();
    if (!phoneNumberId && envConfig.phoneNumberId) {
      phoneNumberId = envConfig.phoneNumberId;
    }
    if (!wabaId && envConfig.wabaId) {
      wabaId = envConfig.wabaId;
    }
    if (!accessToken && envConfig.accessToken) {
      accessToken = envConfig.accessToken;
    }
    if (!appSecret && envConfig.appSecret) {
      appSecret = envConfig.appSecret;
    }
    if (!verifyToken && envConfig.verifyToken) {
      verifyToken = envConfig.verifyToken;
    }

    // 3. Validate presence of minimum credentials for testing
    if (!phoneNumberId || !accessToken) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing connection credentials. Phone Number ID and Permanent Access Token are required.",
          code: "MISSING_CREDENTIALS",
        },
        { status: 400 }
      );
    }

    // 4. Test WhatsApp Cloud API Connectivity against Meta
    const testResult = await verifyWhatsAppCredentials({
      phoneNumberId,
      accessToken,
      wabaId: wabaId || undefined,
    });

    if (!testResult.success) {
      // If credentials already exist in DB, flag error state
      if (waAccount) {
        await supabase
          .from("whatsapp_accounts")
          .update({
            status: "error",
            error_message: testResult.error,
            updated_at: new Date().toISOString(),
          })
          .eq("id", waAccount.id);
      }

      return NextResponse.json(
        {
          success: false,
          error: testResult.error,
          code: testResult.code,
        },
        { status: testResult.statusCode || 400 }
      );
    }

    const profileData = testResult.data;

    // 5. If 'save' is requested, encrypt credentials with AES-256-GCM and store in DB
    if (save) {
      if (!appSecret || !wabaId || !verifyToken) {
        return NextResponse.json(
          {
            success: false,
            error: "Missing connection credentials. All 5 WhatsApp credentials (Phone Number ID, WABA ID, App Secret, Verify Token, Access Token) are required to connect and save.",
            code: "INCOMPLETE_CREDENTIALS",
          },
          { status: 400 }
        );
      }

      let encryptedSecret;
      let encryptedToken;

      try {
        encryptedSecret = encryptCredential(appSecret);
        encryptedToken = encryptCredential(accessToken);
      } catch (encErr) {
        return NextResponse.json(
          {
            success: false,
            error: encErr instanceof Error ? encErr.message : "Encryption failed. Verify CREDENTIAL_ENCRYPTION_KEY.",
            code: "ENCRYPTION_ERROR",
          },
          { status: 500 }
        );
      }

      const payload = {
        user_id: user.id,
        phone_number_id: phoneNumberId,
        waba_id: wabaId,
        display_phone_number: profileData?.display_phone_number || null,
        verified_name: profileData?.verified_name || null,
        quality_rating: profileData?.quality_rating || "UNKNOWN",
        status: "connected",
        verify_token: verifyToken,
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
        if (saveErr.code === "42501" || saveErr.message?.toLowerCase().includes("row-level security")) {
          return NextResponse.json(
            {
              success: false,
              error: "Supabase database permission denied: Row Level Security policy prevented saving WhatsApp credentials.",
              code: "RLS_PERMISSION_DENIED",
            },
            { status: 403 }
          );
        }

        return NextResponse.json(
          {
            success: false,
            error: `Supabase database error: ${saveErr.message}`,
            code: "DB_SAVE_ERROR",
          },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        status: "connected",
        account: savedAccount,
        profile: profileData,
        message: "Credentials verified, encrypted with AES-256-GCM, and saved successfully!",
      });
    }

    // If test only, update status to connected in DB if account already exists
    if (waAccount) {
      await supabase
        .from("whatsapp_accounts")
        .update({
          status: "connected",
          display_phone_number: profileData?.display_phone_number || waAccount.display_phone_number,
          verified_name: profileData?.verified_name || waAccount.verified_name,
          quality_rating: profileData?.quality_rating || waAccount.quality_rating,
          error_message: null,
          last_synced_at: new Date().toISOString(),
        })
        .eq("id", waAccount.id);
    }

    return NextResponse.json({
      success: true,
      status: "connected",
      profile: profileData,
      message: "Meta WhatsApp Cloud API verified successfully.",
    });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Internal Server Error",
      },
      { status: 500 }
    );
  }
}
