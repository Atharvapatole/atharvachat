import { cleanPhoneNumber } from "./utils";

const GRAPH_API_BASE = "https://graph.facebook.com/v21.0";

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
 * Test connectivity and fetch business phone metadata from Meta Graph API
 */
export async function testWhatsAppConnection(
  phoneNumberId: string,
  accessToken: string
): Promise<{ success: boolean; data?: WhatsAppProfileResponse; error?: string }> {
  try {
    const url = `${GRAPH_API_BASE}/${encodeURIComponent(phoneNumberId)}?fields=id,verified_name,display_phone_number,quality_rating,code_verification_status`;
    const res = await fetch(url, {
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
        error: data.error?.message || `HTTP ${res.status}: Failed to connect to WhatsApp Cloud API`,
      };
    }

    return {
      success: true,
      data: data as WhatsAppProfileResponse,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Network error contacting Meta Graph API";
    return { success: false, error: errorMsg };
  }
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
    const url = `${GRAPH_API_BASE}/${encodeURIComponent(phoneNumberId)}/messages`;
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

    const res = await fetch(url, {
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
    const url = `${GRAPH_API_BASE}/${encodeURIComponent(phoneNumberId)}/messages`;
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

    const res = await fetch(url, {
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
    const url = `${GRAPH_API_BASE}/${encodeURIComponent(wabaId)}/message_templates?limit=100`;
    const res = await fetch(url, {
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
    const url = `${GRAPH_API_BASE}/${encodeURIComponent(phoneNumberId)}/messages`;
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
