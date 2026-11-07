import { cleanPhoneNumber } from "./utils";
import { META_GRAPH_BASE_URL } from "./config";

export interface WhatsAppApiError {
  message: string;
  type: string;
  code: number;
  error_subcode?: number;
  fbtrace_id?: string;
}

export interface SendMessageResult {
  success: boolean;
  messageId?: string;
  error?: WhatsAppApiError | string;
  statusCode?: number;
}

export interface WhatsAppProfileResponse {
  id: string;
  verified_name?: string;
  display_phone_number?: string;
  quality_rating?: string;
  code_verification_status?: string;
}

/**
 * Helper to execute fetch with transient error retries (for HTTP 429, 500, 503)
 */
async function fetchWithRetry(url: string, options: RequestInit, retries = 2): Promise<Response> {
  let attempt = 0;
  while (attempt <= retries) {
    try {
      const response = await fetch(url, options);
      if (response.status === 429 || response.status === 500 || response.status === 503) {
        if (attempt < retries) {
          attempt++;
          await new Promise((res) => setTimeout(res, 500 * Math.pow(2, attempt)));
          continue;
        }
      }
      return response;
    } catch (err) {
      if (attempt < retries) {
        attempt++;
        await new Promise((res) => setTimeout(res, 500 * Math.pow(2, attempt)));
        continue;
      }
      throw err;
    }
  }
  return fetch(url, options);
}

export interface VerifyWhatsAppResult {
  success: boolean;
  statusCode: number;
  data?: WhatsAppProfileResponse;
  error?: string;
  code?: string;
}

/**
 * Parses and maps Meta Graph API error payloads into actionable, safe user messages.
 * Never exposes raw access tokens, App Secrets, or cryptographic secrets.
 */
export function formatMetaApiError(
  status: number,
  data: any,
  context: "phone_number" | "waba" | "message" = "phone_number"
): { message: string; code: string } {
  const metaError = data?.error;
  const errorCode = metaError?.code;
  const rawMsg = String(metaError?.message || "");

  // 1. Invalid or expired OAuth Access Token
  if (
    status === 401 ||
    errorCode === 190 ||
    rawMsg.toLowerCase().includes("invalid oauth access token") ||
    rawMsg.toLowerCase().includes("session has expired")
  ) {
    return {
      message: "Invalid or expired Meta access token. Please verify or regenerate your System User token in Meta Business Manager.",
      code: "META_INVALID_TOKEN",
    };
  }

  // 2. Missing WhatsApp Permissions
  if (
    errorCode === 200 ||
    errorCode === 10 ||
    rawMsg.toLowerCase().includes("permission") ||
    rawMsg.toLowerCase().includes("whatsapp_business_messaging") ||
    rawMsg.toLowerCase().includes("whatsapp_business_management")
  ) {
    return {
      message: "Missing WhatsApp permissions. Ensure the Meta System User has 'whatsapp_business_messaging' and 'whatsapp_business_management' permissions assigned.",
      code: "META_MISSING_PERMISSIONS",
    };
  }

  // 3. WABA Access Denied
  if (context === "waba" && (status === 403 || errorCode === 200 || errorCode === 10)) {
    return {
      message: "WhatsApp Business Account access denied. Verify that the System User has been assigned as an asset to your WhatsApp Business Account in Meta Business Manager.",
      code: "META_WABA_ACCESS_DENIED",
    };
  }

  // 4. Object Not Found (Invalid Phone Number ID or WABA ID)
  if (
    errorCode === 100 ||
    status === 404 ||
    rawMsg.toLowerCase().includes("does not exist") ||
    rawMsg.toLowerCase().includes("unsupported get request")
  ) {
    if (context === "phone_number") {
      return {
        message: "Phone Number ID not found on Meta. Verify your WhatsApp Phone Number ID in Meta App Dashboard > WhatsApp > API Setup.",
        code: "META_PHONE_ID_NOT_FOUND",
      };
    }
    return {
      message: "WhatsApp Business Account (WABA ID) not found on Meta. Verify your WABA ID in Meta Business Manager.",
      code: "META_WABA_NOT_FOUND",
    };
  }

  // 5. Rate limits and transient errors
  if (status === 429) {
    return {
      message: "Meta Graph API rate limit reached. Please wait a few moments before trying again.",
      code: "META_RATE_LIMIT",
    };
  }

  if (status === 500 || status === 503) {
    return {
      message: `Meta API temporarily unavailable (HTTP ${status}). Please retry in a few moments.`,
      code: "META_UNAVAILABLE",
    };
  }

  // Fallback to safe message without exposing sensitive details
  const sanitized = rawMsg
    ? rawMsg.replace(/EA[A-Za-z0-9_-]{20,}/g, "[TOKEN_REDACTED]")
    : `HTTP ${status}: Failed to communicate with Meta Cloud API`;

  return {
    message: sanitized,
    code: "META_API_ERROR",
  };
}

/**
 * Validates Meta WhatsApp Cloud API credentials against both:
 * 1. GET /{PHONE_NUMBER_ID}?fields=id,verified_name,display_phone_number,quality_rating
 * 2. GET /{WABA_ID}/phone_numbers (confirms Phone Number ID belongs to specified WABA)
 * Checks Meta token permissions and returns actionable error messages.
 */
export async function verifyWhatsAppCredentials(params: {
  phoneNumberId: string;
  accessToken: string;
  wabaId?: string;
}): Promise<VerifyWhatsAppResult> {
  const { phoneNumberId, accessToken, wabaId } = params;

  if (!phoneNumberId || !phoneNumberId.trim()) {
    return {
      success: false,
      statusCode: 400,
      error: "Phone Number ID is required.",
      code: "MISSING_PHONE_NUMBER_ID",
    };
  }

  if (!accessToken || !accessToken.trim()) {
    return {
      success: false,
      statusCode: 400,
      error: "System User Access Token is required.",
      code: "MISSING_ACCESS_TOKEN",
    };
  }

  const cleanPhoneId = phoneNumberId.trim();
  const cleanToken = accessToken.trim();
  const cleanWabaId = wabaId?.trim();

  // Step 1: Validate Phone Number ID against Meta Graph API
  try {
    const phoneUrl = `${META_GRAPH_BASE_URL}/${encodeURIComponent(cleanPhoneId)}?fields=id,verified_name,display_phone_number,quality_rating,code_verification_status`;
    const phoneRes = await fetchWithRetry(phoneUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${cleanToken}`,
        "Content-Type": "application/json",
      },
    });

    const phoneData = await phoneRes.json().catch(() => ({}));

    if (!phoneRes.ok || phoneData.error) {
      const formatted = formatMetaApiError(phoneRes.status, phoneData, "phone_number");
      return {
        success: false,
        statusCode: phoneRes.status,
        error: formatted.message,
        code: formatted.code,
      };
    }

    // Validate that returned ID matches the configured ID
    if (phoneData.id !== cleanPhoneId) {
      return {
        success: false,
        statusCode: 400,
        error: `Phone Number ID returned by Meta (${phoneData.id}) does not match the configured Phone Number ID (${cleanPhoneId}).`,
        code: "PHONE_ID_MISMATCH",
      };
    }

    const profile: WhatsAppProfileResponse = {
      id: phoneData.id,
      verified_name: phoneData.verified_name,
      display_phone_number: phoneData.display_phone_number,
      quality_rating: phoneData.quality_rating,
      code_verification_status: phoneData.code_verification_status,
    };

    // Step 2: If WABA ID is provided, verify WABA access and confirm Phone Number ID belongs to the WABA
    if (cleanWabaId) {
      const wabaUrl = `${META_GRAPH_BASE_URL}/${encodeURIComponent(cleanWabaId)}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating`;
      const wabaRes = await fetchWithRetry(wabaUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${cleanToken}`,
          "Content-Type": "application/json",
        },
      });

      const wabaData = await wabaRes.json().catch(() => ({}));

      if (!wabaRes.ok || wabaData.error) {
        const formatted = formatMetaApiError(wabaRes.status, wabaData, "waba");
        return {
          success: false,
          statusCode: wabaRes.status,
          error: formatted.message,
          code: formatted.code,
        };
      }

      const wabaPhones: Array<{ id: string }> = wabaData.data || [];
      const belongsToWaba = wabaPhones.some((p) => p.id === cleanPhoneId);

      if (!belongsToWaba) {
        return {
          success: false,
          statusCode: 400,
          error: `Phone Number ID does not match the WABA. The configured Phone Number ID (${cleanPhoneId}) does not belong to WhatsApp Business Account (${cleanWabaId}).`,
          code: "PHONE_WABA_MISMATCH",
        };
      }
    }

    return {
      success: true,
      statusCode: 200,
      data: profile,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Network error contacting Meta Graph API";
    return {
      success: false,
      statusCode: 502,
      error: `Meta API temporarily unavailable: ${errorMsg}`,
      code: "META_NETWORK_ERROR",
    };
  }
}

/**
 * Test connectivity and fetch business phone metadata from Meta Graph API (alias)
 */
export async function testWhatsAppConnection(
  phoneNumberId: string,
  accessToken: string,
  wabaId?: string
): Promise<{ success: boolean; data?: WhatsAppProfileResponse; error?: string; statusCode?: number; code?: string }> {
  const result = await verifyWhatsAppCredentials({ phoneNumberId, accessToken, wabaId });
  return {
    success: result.success,
    data: result.data,
    error: result.error,
    statusCode: result.statusCode,
    code: result.code,
  };
}

/**
 * Send a standard free-form text message via WhatsApp Cloud API
 * Note: Free-form text is permitted only within the Meta 24-hour service window.
 */
export async function sendWhatsAppTextMessage(params: {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  text: string;
  previewUrl?: boolean;
}): Promise<SendMessageResult> {
  const { phoneNumberId, accessToken, to, text, previewUrl = false } = params;
  const recipient = cleanPhoneNumber(to);

  try {
    const url = `${META_GRAPH_BASE_URL}/${encodeURIComponent(phoneNumberId)}/messages`;
    const body = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: recipient,
      type: "text",
      text: {
        preview_url: previewUrl,
        body: text,
      },
    };

    const res = await fetchWithRetry(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (!res.ok || data.error) {
      const apiError: WhatsAppApiError = data.error || {
        message: `HTTP ${res.status}: Error sending WhatsApp message`,
        code: res.status,
        type: "HttpError",
      };

      // Friendly interpretation of standard WhatsApp Cloud API error codes
      if (apiError.code === 131047) {
        apiError.message =
          "24-Hour Customer Window Expired: WhatsApp requires an approved Message Template to initiate or re-engage this conversation.";
      } else if (apiError.code === 131026) {
        apiError.message = "Message undeliverable to this phone number. Verify the recipient has an active WhatsApp account.";
      } else if (apiError.code === 190) {
        apiError.message = "Invalid or expired WhatsApp Access Token. Please refresh credentials in Settings.";
      }

      return {
        success: false,
        error: apiError,
        statusCode: res.status,
      };
    }

    const messageId = data.messages?.[0]?.id;
    return {
      success: true,
      messageId,
      statusCode: res.status,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to execute WhatsApp API request";
    return {
      success: false,
      error: msg,
    };
  }
}

/**
 * Send an approved WhatsApp Message Template (Can be sent outside 24h window for campaigns & notifications)
 */
export async function sendWhatsAppTemplateMessage(params: {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  templateName: string;
  languageCode?: string;
  components?: Array<Record<string, unknown>>;
}): Promise<SendMessageResult> {
  const { phoneNumberId, accessToken, to, templateName, languageCode = "en_US", components = [] } = params;
  const recipient = cleanPhoneNumber(to);

  try {
    const url = `${META_GRAPH_BASE_URL}/${encodeURIComponent(phoneNumberId)}/messages`;
    const body = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: recipient,
      type: "template",
      template: {
        name: templateName,
        language: {
          code: languageCode,
        },
        components: components.length > 0 ? components : undefined,
      },
    };

    const res = await fetchWithRetry(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (!res.ok || data.error) {
      return {
        success: false,
        error: data.error || `HTTP ${res.status}: Failed to send template`,
        statusCode: res.status,
      };
    }

    return {
      success: true,
      messageId: data.messages?.[0]?.id,
      statusCode: res.status,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to execute WhatsApp template request";
    return {
      success: false,
      error: msg,
    };
  }
}

/**
 * Fetch approved message templates from WhatsApp Business Account
 */
export async function fetchWhatsAppTemplates(
  wabaId: string,
  accessToken: string
): Promise<{ success: boolean; templates?: Array<Record<string, unknown>>; error?: string }> {
  try {
    const url = `${META_GRAPH_BASE_URL}/${encodeURIComponent(wabaId)}/message_templates?limit=100`;
    const res = await fetchWithRetry(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    const data = await res.json();
    if (!res.ok || data.error) {
      return {
        success: false,
        error: data.error?.message || "Failed to fetch templates from Meta",
      };
    }

    return {
      success: true,
      templates: data.data || [],
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error querying message templates",
    };
  }
}

/**
 * Mark incoming message as read
 */
export async function markWhatsAppMessageRead(
  phoneNumberId: string,
  accessToken: string,
  messageId: string
): Promise<boolean> {
  try {
    const url = `${META_GRAPH_BASE_URL}/${encodeURIComponent(phoneNumberId)}/messages`;
    await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        status: "read",
        message_id: messageId,
      }),
    });
    return true;
  } catch {
    return false;
  }
}
