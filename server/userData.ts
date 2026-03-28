/**
 * Simple file-based per-user data store.
 * Data is stored as JSON in a "data/" directory next to the server binary.
 * Each user gets their own file: data/users/<username>.json
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

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
