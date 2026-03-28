import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

export interface AuthUser {
  username: string;
  password: string; // plaintext from env, hashed at startup
}

interface JwtPayload {
  username: string;
}

// Load and hash users from AUTH_USERS env var on startup
// Format: '[{"username":"admin","password":"secret"}]'
let users: { username: string; hash: string }[] = [];

function loadUsers() {
  const raw = process.env.AUTH_USERS;
  if (!raw) return;
  try {
    const parsed: AuthUser[] = JSON.parse(raw);
    users = parsed.map((u) => ({
      username: u.username,
      hash: bcrypt.hashSync(u.password, 10),
    }));
    console.log(
      `Auth enabled — ${users.length} user(s): ${users.map((u) => u.username).join(", ")}`,
    );
  } catch {
    console.error(
      "AUTH_USERS is not valid JSON. Expected: [{\"username\":\"...\",\"password\":\"...\"}]",
    );
  }
}

loadUsers();

export function isAuthEnabled(): boolean {
  return users.length > 0;
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.warn("JWT_SECRET is not set — using insecure fallback. Set it in production!");
    return "change-me-in-production";
  }
  return secret;
}

export function validateCredentials(
  username: string,
  password: string,
): boolean {
  const user = users.find((u) => u.username === username);
  if (!user) return false;
  return bcrypt.compareSync(password, user.hash);
}

export function signToken(username: string): string {
  return jwt.sign({ username } satisfies JwtPayload, getJwtSecret(), {
    expiresIn: "7d",
  });
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
    jwt.verify(token, getJwtSecret()) as JwtPayload;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
