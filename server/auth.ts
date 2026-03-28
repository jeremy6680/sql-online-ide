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

// Load and hash users from AUTH_USERS env var on startup.
//
// Two supported formats:
//   JSON array:   [{"username":"admin","password":"secret"}]
//   Simple pairs: admin:secret  or  admin:secret,bob:pass2
let users: { username: string; hash: string }[] = [];

function parseUsers(raw: string): AuthUser[] {
  const trimmed = raw.trim();
  // JSON format
  if (trimmed.startsWith("[")) {
    return JSON.parse(trimmed) as AuthUser[];
  }
  // Simple "username:password" pairs separated by commas
  return trimmed.split(",").map((pair) => {
    const colon = pair.indexOf(":");
    if (colon === -1) throw new Error(`Invalid pair (no colon): "${pair}"`);
    return {
      username: pair.slice(0, colon).trim(),
      password: pair.slice(colon + 1).trim(),
    };
  });
}

function loadUsers() {
  const raw = process.env.AUTH_USERS;
  if (!raw) {
    console.log("AUTH_USERS not set — authentication disabled");
    return;
  }
  try {
    const parsed = parseUsers(raw);
    users = parsed.map((u) => ({
      username: u.username,
      hash: bcrypt.hashSync(u.password, 10),
    }));
    console.log(
      `Auth enabled — ${users.length} user(s): ${users.map((u) => u.username).join(", ")}`,
    );
  } catch (err) {
    console.error(`AUTH_USERS parse error: ${String(err)}`);
    console.error(
      "Supported formats:\n" +
      '  JSON:   [{\"username\":\"admin\",\"password\":\"secret\"}]\n' +
      "  Simple: admin:secret  or  admin:secret,bob:pass2",
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

// Augment Express Request so downstream handlers can read req.username
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
