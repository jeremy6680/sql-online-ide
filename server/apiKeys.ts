/**
 * Encrypted storage for user API keys (Anthropic, OpenAI).
 *
 * Keys are encrypted with AES-256-GCM before being written to disk.
 * The encryption key is derived from ENCRYPTION_KEY env var (preferred)
 * or JWT_SECRET as fallback, both stretched via scrypt to exactly 32 bytes.
 *
 * Stored format (base64 of): [12-byte IV][16-byte authTag][ciphertext]
 *
 * Raw keys are NEVER returned to the frontend — the frontend only learns
 * whether a key is present (boolean). Only the server uses the decrypted key
 * when calling AI providers.
 */
import crypto from "crypto";

export type AiProvider = "anthropic" | "openai";

function getEncryptionMaterial(): Buffer {
  const secret = process.env.ENCRYPTION_KEY ?? process.env.JWT_SECRET;
  if (!secret || secret === "change-me-in-production") {
    if (!process.env.ENCRYPTION_KEY) {
      console.warn(
        "[apiKeys] ENCRYPTION_KEY not set — falling back to JWT_SECRET for API key encryption. " +
        "Set a dedicated ENCRYPTION_KEY in production.",
      );
    }
  }
  if (!secret) {
    throw new Error("Neither ENCRYPTION_KEY nor JWT_SECRET is set.");
  }
  // Stretch to exactly 32 bytes using scryptSync with a fixed salt.
  // The "fixed salt" is intentional: we need deterministic derivation at
  // server startup so a restarted server can still decrypt stored keys.
  return crypto.scryptSync(secret, "sql-ide-apikey-salt-v1", 32);
}

export function encryptApiKey(plaintext: string): string {
  const key = getEncryptionMaterial();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag(); // 16 bytes
  // Pack: iv(12) + authTag(16) + ciphertext → base64
  const packed = Buffer.concat([iv, authTag, ciphertext]);
  return packed.toString("base64");
}

export function decryptApiKey(encrypted: string): string {
  const key = getEncryptionMaterial();
  const packed = Buffer.from(encrypted, "base64");
  if (packed.length < 28) throw new Error("Invalid encrypted key format.");
  const iv = packed.subarray(0, 12);
  const authTag = packed.subarray(12, 28);
  const ciphertext = packed.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(ciphertext) + decipher.final("utf8");
}
