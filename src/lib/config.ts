/**
 * Centralized Application & Meta WhatsApp Production Configuration
 * Official Domain: https://atharvachat.vercel.app
 */

export const PRODUCTION_APP_URL = "https://atharvachat.vercel.app";

export function getAppUrl(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || PRODUCTION_APP_URL;
  return url.replace(/\/+$/, ""); // Trim trailing slashes
}

export function getWebhookUrl(): string {
  return `${getAppUrl()}/api/webhooks/whatsapp`;
}

export const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v21.0";
export const META_GRAPH_BASE_URL = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

/**
 * Returns environment-configured Meta WhatsApp credentials (if configured at the environment level in Vercel)
 */
export function getEnvWhatsAppConfig() {
  return {
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() || null,
    wabaId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID?.trim() || null,
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN?.trim() || null,
    appSecret: process.env.META_APP_SECRET?.trim() || null,
    verifyToken: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim() || null,
  };
}
