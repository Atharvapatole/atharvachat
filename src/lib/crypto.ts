import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // Standard 96-bit IV for AES-GCM
const AUTH_TAG_LENGTH = 16; // Standard 128-bit authentication tag

function getEncryptionKey(): Buffer {
  const secret = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error("CREDENTIAL_ENCRYPTION_KEY environment variable is missing.");
  }
  // If hex string of length 64 (32 bytes), parse it directly
  if (secret.length === 64 && /^[0-9a-fA-F]+$/.test(secret)) {
    return Buffer.from(secret, "hex");
  }
  // Otherwise derive a deterministic 32-byte key via SHA-256
  return crypto.createHash("sha256").update(secret).digest();
}

export interface EncryptedPayload {
  ciphertext: string; // hex
  iv: string; // hex
  tag: string; // hex
}

/**
 * Encrypt a plaintext string using AES-256-GCM
 */
export function encryptCredential(plaintext: string): EncryptedPayload {
  if (!plaintext) {
    throw new Error("Cannot encrypt empty value");
  }
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag().toString("hex");

  return {
    ciphertext: encrypted,
    iv: iv.toString("hex"),
    tag: tag,
  };
}

/**
 * Decrypt an AES-256-GCM encrypted payload
 */
export function decryptCredential(encrypted: EncryptedPayload): string {
  if (!encrypted || !encrypted.ciphertext || !encrypted.iv || !encrypted.tag) {
    throw new Error("Invalid encrypted payload structure");
  }
  const key = getEncryptionKey();
  const iv = Buffer.from(encrypted.iv, "hex");
  const tag = Buffer.from(encrypted.tag, "hex");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(encrypted.ciphertext, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

/**
 * Verify Meta Webhook SHA256 Signature
 * Header: X-Hub-Signature-256: sha256={hash}
 */
export function verifyMetaWebhookSignature(
  rawBody: string | Buffer,
  signatureHeader: string | null | undefined,
  appSecret: string
): boolean {
  if (!signatureHeader || !appSecret) return false;
  const parts = signatureHeader.split("sha256=");
  if (parts.length !== 2) return false;
  const expectedHash = parts[1].trim();

  const hmac = crypto.createHmac("sha256", appSecret);
  hmac.update(rawBody);
  const calculatedHash = hmac.digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expectedHash, "hex"),
      Buffer.from(calculatedHash, "hex")
    );
  } catch {
    return false;
  }
}
