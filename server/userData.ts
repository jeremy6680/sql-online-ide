/**
 * Simple file-based per-user data store.
 * Data is stored as JSON in a "data/" directory next to the server binary.
 * Each user gets their own file: data/users/<username>.json
 *
 * API keys are stored encrypted (see apiKeys.ts) — the raw key is never
 * written to disk in plaintext.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { encryptApiKey, decryptApiKey, type AiProvider } from "./apiKeys.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../data/users");

function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function filePath(username: string) {
  // Sanitize username to prevent path traversal
  const safe = username.replace(/[^a-zA-Z0-9_.-]/g, "_");
  return path.join(DATA_DIR, `${safe}.json`);
}

export interface UserData {
  history: unknown[];
  favoriteQueries: unknown[];
  savedConnections: unknown[];
  language?: "en" | "fr";
  /** Encrypted API keys keyed by provider name. Never exposed to the frontend. */
  encryptedApiKeys?: Partial<Record<AiProvider, string>>;
}

export function loadUserData(username: string): UserData {
  ensureDir();
  try {
    const raw = fs.readFileSync(filePath(username), "utf8");
    return JSON.parse(raw) as UserData;
  } catch {
    return { history: [], favoriteQueries: [], savedConnections: [] };
  }
}

export function saveUserData(username: string, data: UserData): void {
  ensureDir();
  fs.writeFileSync(filePath(username), JSON.stringify(data, null, 2), "utf8");
}

// ─── API key helpers ──────────────────────────────────────────────────────────

export function setApiKey(username: string, provider: AiProvider, rawKey: string): void {
  const data = loadUserData(username);
  data.encryptedApiKeys = {
    ...data.encryptedApiKeys,
    [provider]: encryptApiKey(rawKey),
  };
  saveUserData(username, data);
}

export function deleteApiKey(username: string, provider: AiProvider): void {
  const data = loadUserData(username);
  if (data.encryptedApiKeys) {
    delete data.encryptedApiKeys[provider];
  }
  saveUserData(username, data);
}

/** Returns which providers have a stored key, without exposing the key itself. */
export function getApiKeyPresence(username: string): Record<AiProvider, boolean> {
  const data = loadUserData(username);
  return {
    anthropic: !!data.encryptedApiKeys?.anthropic,
    openai: !!data.encryptedApiKeys?.openai,
  };
}

/** Returns the decrypted raw API key for a provider, or null if not set. */
export function getDecryptedApiKey(username: string, provider: AiProvider): string | null {
  const data = loadUserData(username);
  const encrypted = data.encryptedApiKeys?.[provider];
  if (!encrypted) return null;
  try {
    return decryptApiKey(encrypted);
  } catch {
    console.error(`[userData] Failed to decrypt ${provider} key for ${username}`);
    return null;
  }
}
