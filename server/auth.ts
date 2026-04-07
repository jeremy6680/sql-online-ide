/**
 * Authentication module.
 *
 * Supports two user sources:
 *  1. AUTH_USERS env var  — static users defined at deploy time (bcrypt-hashed at startup)
 *  2. data/auth/users.json — self-registered users (enabled by ALLOW_REGISTRATION=true)
 *
 * Passwords for registered users are hashed with bcrypt (12 rounds).
 * Failed login attempts are rate-limited per IP (5 attempts / 15 min window).
 *
 * Password requirements for registration:
 *  - At least 8 characters
 *  - At least one uppercase letter
 *  - At least one lowercase letter
 *  - At least one digit
 */
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_DIR = path.resolve(__dirname, "../data/auth");
const USERS_FILE = path.join(AUTH_DIR, "users.json");

// ─── Registered user types ────────────────────────────────────────────────────

export interface RegisteredUser {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  createdAt: string;
}

// ─── Env-var users (backward compat) ─────────────────────────────────────────

export interface AuthUser {
  username: string;
  password: string;
}

let envUsers: { username: string; hash: string }[] = [];

function parseEnvUsers(raw: string): AuthUser[] {
  const trimmed = raw.trim();
  if (trimmed.startsWith("[")) return JSON.parse(trimmed) as AuthUser[];
  return trimmed.split(",").map((pair) => {
    const colon = pair.indexOf(":");
    if (colon === -1) throw new Error(`Invalid pair (no colon): "${pair}"`);
    return { username: pair.slice(0, colon).trim(), password: pair.slice(colon + 1).trim() };
  });
}

function loadEnvUsers() {
  const raw = process.env.AUTH_USERS;
  if (!raw) return;
  try {
    const parsed = parseEnvUsers(raw);
    envUsers = parsed.map((u) => ({ username: u.username, hash: bcrypt.hashSync(u.password, 10) }));
    console.log(`Auth (env) — ${envUsers.length} user(s): ${envUsers.map((u) => u.username).join(", ")}`);
  } catch (err) {
    console.error(`AUTH_USERS parse error: ${String(err)}`);
  }
}

loadEnvUsers();

// ─── File-based registered users ─────────────────────────────────────────────

function ensureAuthDir() {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
}

function loadRegisteredUsers(): RegisteredUser[] {
  ensureAuthDir();
  try {
    const raw = fs.readFileSync(USERS_FILE, "utf8");
    return JSON.parse(raw) as RegisteredUser[];
  } catch {
    return [];
  }
}

function saveRegisteredUsers(users: RegisteredUser[]) {
  ensureAuthDir();
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf8");
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function isAuthEnabled(): boolean {
  if (envUsers.length > 0) return true;
  if (process.env.ALLOW_REGISTRATION === "true") return true;
  return loadRegisteredUsers().length > 0;
}

export function isRegistrationEnabled(): boolean {
  return process.env.ALLOW_REGISTRATION === "true";
}

export interface RegistrationResult {
  ok: boolean;
  error?: string;
}

const PASSWORD_REQUIREMENTS =
  "Password must be at least 8 characters and contain at least one uppercase letter, one lowercase letter, and one digit.";

export function registerUser(
  username: string,
  email: string,
  password: string,
): RegistrationResult {
  if (!isRegistrationEnabled()) {
    return { ok: false, error: "Registration is not enabled on this server." };
  }

  // Validate password strength
  if (
    password.length < 8 ||
    !/[A-Z]/.test(password) ||
    !/[a-z]/.test(password) ||
    !/[0-9]/.test(password)
  ) {
    return { ok: false, error: PASSWORD_REQUIREMENTS };
  }

  // Sanitize username (alphanumeric, underscore, dash, dot — 3–32 chars)
  if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) {
    return {
      ok: false,
      error: "Username must be 3–32 characters (letters, digits, _, -, . only).",
    };
  }

  // Basic email check
  if (!email.includes("@") || email.length > 254) {
    return { ok: false, error: "Invalid email address." };
  }

  const existing = loadRegisteredUsers();

  if (existing.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
    return { ok: false, error: "Username already taken." };
  }
  if (existing.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
    return { ok: false, error: "An account with this email already exists." };
  }
  // Also check env-var users
  if (envUsers.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
    return { ok: false, error: "Username already taken." };
  }

  const newUser: RegisteredUser = {
    id: crypto.randomUUID(),
    username,
    email,
    passwordHash: bcrypt.hashSync(password, 12),
    createdAt: new Date().toISOString(),
  };

  saveRegisteredUsers([...existing, newUser]);
  console.log(`New user registered: ${username} (${email})`);
  return { ok: true };
}

/**
 * Validate login credentials. `identifier` can be a username OR email address.
 * Returns the canonical username on success, null on failure.
 */
export function validateCredentials(
  identifier: string,
  password: string,
): string | null {
  const isEmail = identifier.includes("@");

  // Check env-var users (username only — they have no email)
  if (!isEmail) {
    const envUser = envUsers.find(
      (u) => u.username.toLowerCase() === identifier.toLowerCase(),
    );
    if (envUser) {
      return bcrypt.compareSync(password, envUser.hash) ? envUser.username : null;
    }
  }

  // Check file-based registered users (by email or username)
  const registered = loadRegisteredUsers();
  const user = isEmail
    ? registered.find((u) => u.email.toLowerCase() === identifier.toLowerCase())
    : registered.find((u) => u.username.toLowerCase() === identifier.toLowerCase());

  if (!user) return null;
  return bcrypt.compareSync(password, user.passwordHash) ? user.username : null;
}

// ─── Password reset tokens ────────────────────────────────────────────────────
// Stored in memory; single active token per user; expires after 1 hour.

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

interface ResetEntry {
  username: string;
  email: string;
  expiresAt: number;
}

const resetTokens = new Map<string, ResetEntry>();

/**
 * Look up a registered user by email. Returns null if not found.
 * Env-var users cannot reset passwords (they have no email).
 */
export function findUserByEmail(
  email: string,
): { username: string; email: string } | null {
  const registered = loadRegisteredUsers();
  const user = registered.find(
    (u) => u.email.toLowerCase() === email.toLowerCase(),
  );
  return user ? { username: user.username, email: user.email } : null;
}

/** Generate a reset token for a user. Invalidates any existing token for that user. */
export function createPasswordResetToken(username: string, email: string): string {
  // Remove any previous token for this user
  for (const [tok, entry] of resetTokens) {
    if (entry.username === username) resetTokens.delete(tok);
  }
  const token = crypto.randomBytes(32).toString("hex");
  resetTokens.set(token, { username, email, expiresAt: Date.now() + RESET_TOKEN_TTL_MS });
  return token;
}

/** Validate a reset token. Returns the associated entry or null if invalid/expired. */
export function validateResetToken(token: string): ResetEntry | null {
  const entry = resetTokens.get(token);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    resetTokens.delete(token);
    return null;
  }
  return entry;
}

/** Reset a user's password using a valid token. Returns ok/error. */
export function applyPasswordReset(
  token: string,
  newPassword: string,
): { ok: boolean; error?: string } {
  const entry = validateResetToken(token);
  if (!entry) return { ok: false, error: "Reset link is invalid or has expired." };

  if (
    newPassword.length < 8 ||
    !/[A-Z]/.test(newPassword) ||
    !/[a-z]/.test(newPassword) ||
    !/[0-9]/.test(newPassword)
  ) {
    return { ok: false, error: PASSWORD_REQUIREMENTS };
  }

  const registered = loadRegisteredUsers();
  const idx = registered.findIndex(
    (u) => u.username === entry.username,
  );
  if (idx === -1) return { ok: false, error: "User not found." };

  registered[idx].passwordHash = bcrypt.hashSync(newPassword, 12);
  saveRegisteredUsers(registered);
  resetTokens.delete(token);
  console.log(`Password reset for: ${entry.username}`);
  return { ok: true };
}

// ─── JWT helpers ──────────────────────────────────────────────────────────────

interface JwtPayload {
  username: string;
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret === "change-me-in-production") {
    console.warn("JWT_SECRET is not set or is the default — set it in production!");
  }
  return secret ?? "change-me-in-production";
}

export function signToken(username: string): string {
  return jwt.sign({ username } satisfies JwtPayload, getJwtSecret(), { expiresIn: "7d" });
}

// ─── Rate limiting (in-memory, per IP) ───────────────────────────────────────
// 5 failed attempts per 15-minute window per IP address.

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 5;

interface RateEntry {
  count: number;
  windowStart: number;
}

const loginAttempts = new Map<string, RateEntry>();

export function checkLoginRateLimit(ip: string): { allowed: boolean; retryAfterMs?: number } {
  const now = Date.now();
  const entry = loginAttempts.get(ip);

  if (!entry || now - entry.windowStart > WINDOW_MS) {
    // New window
    loginAttempts.set(ip, { count: 1, windowStart: now });
    return { allowed: true };
  }

  if (entry.count >= MAX_ATTEMPTS) {
    const retryAfterMs = WINDOW_MS - (now - entry.windowStart);
    return { allowed: false, retryAfterMs };
  }

  entry.count++;
  return { allowed: true };
}

export function resetLoginRateLimit(ip: string) {
  loginAttempts.delete(ip);
}

// ─── Auth middleware ──────────────────────────────────────────────────────────

declare module "express-serve-static-core" {
  interface Request {
    username?: string;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!isAuthEnabled()) {
    next();
    return;
  }
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, getJwtSecret()) as JwtPayload;
    req.username = payload.username;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
