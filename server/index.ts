import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { rateLimit } from "express-rate-limit";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import {
  mysqlRouter,
  runMySQLQuery,
  getMySQLTables,
  getMySQLColumns,
  getMySQLForeignKeys,
  testMySQLConnection,
} from "./mysql.js";
import {
  postgresRouter,
  runPostgresQuery,
  getPostgresTables,
  getPostgresColumns,
  getPostgresForeignKeys,
  testPostgresConnection,
} from "./postgres.js";
import {
  requireAuth,
  validateCredentials,
  signToken,
  isAuthEnabled,
  isRegistrationEnabled,
  registerUser,
  checkLoginRateLimit,
  resetLoginRateLimit,
  findUserByEmail,
  createPasswordResetToken,
  applyPasswordReset,
} from "./auth.js";
import { sendPasswordResetEmail } from "./mailer.js";
import {
  loadUserData,
  saveUserData,
  setApiKey,
  deleteApiKey,
  getApiKeyPresence,
  getDecryptedApiKey,
} from "./userData.js";
import type { AiProvider } from "./apiKeys.js";
import { generateCertQuestion, generateExam } from "./cert.js";
import type { CertPart, CertQuestionType } from "../src/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
app.use(express.json());

// ─── Auth rate limiter (express-rate-limit) ───────────────────────────────────
// Hard cap: max 20 requests / 15 min per IP on auth endpoints (brute-force guard)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." },
});

// ─── Auth: public status ──────────────────────────────────────────────────────

app.get("/api/auth/status", (_req, res) => {
  res.json({
    authEnabled: isAuthEnabled(),
    registrationEnabled: isRegistrationEnabled(),
  });
});

// ─── Auth: registration ───────────────────────────────────────────────────────

app.post("/api/auth/register", authLimiter, (req, res) => {
  if (!isRegistrationEnabled()) {
    res.status(403).json({ error: "Registration is not enabled on this server." });
    return;
  }

  const { username, email, password } = req.body as {
    username?: string;
    email?: string;
    password?: string;
  };

  if (!username?.trim() || !email?.trim() || !password) {
    res.status(400).json({ error: "username, email, and password are required." });
    return;
  }

  const result = registerUser(username.trim(), email.trim().toLowerCase(), password);
  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }

  // Auto sign-in after successful registration
  const token = signToken(username.trim());
  res.json({ token, username: username.trim(), authEnabled: true });
});

// ─── Auth: login ──────────────────────────────────────────────────────────────

app.post("/api/auth/login", authLimiter, (req, res) => {
  if (!isAuthEnabled()) {
    res.json({ token: null, username: null, authEnabled: false });
    return;
  }

  const ip = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim()
    ?? req.socket.remoteAddress
    ?? "unknown";

  const rateCheck = checkLoginRateLimit(ip);
  if (!rateCheck.allowed) {
    const retryMins = Math.ceil((rateCheck.retryAfterMs ?? 0) / 60000);
    res.status(429).json({
      error: `Too many failed login attempts. Please try again in ${retryMins} minute(s).`,
    });
    return;
  }

  const { username, password } = req.body as { username?: string; password?: string };
  if (!username || !password) {
    res.status(400).json({ error: "username and password are required" });
    return;
  }

  const canonicalUsername = validateCredentials(username, password);
  if (!canonicalUsername) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  // Successful login — clear the rate limit counter for this IP
  resetLoginRateLimit(ip);
  res.json({ token: signToken(canonicalUsername), username: canonicalUsername, authEnabled: true });
});

// ─── Auth: forgot password ────────────────────────────────────────────────────

app.post("/api/auth/forgot-password", authLimiter, async (req, res) => {
  const { email } = req.body as { email?: string };
  if (!email?.includes("@")) {
    res.status(400).json({ error: "A valid email address is required." });
    return;
  }
  // Always respond with success to avoid leaking whether an email is registered
  const user = findUserByEmail(email.trim().toLowerCase());
  if (user) {
    try {
      const token = createPasswordResetToken(user.username, user.email);
      await sendPasswordResetEmail(user.email, user.username, token);
    } catch (err) {
      console.error("[forgot-password] Failed to send email:", String(err));
    }
  }
  res.json({ ok: true });
});

// ─── Auth: reset password ─────────────────────────────────────────────────────

app.post("/api/auth/reset-password", authLimiter, (req, res) => {
  const { token, password } = req.body as { token?: string; password?: string };
  if (!token || !password) {
    res.status(400).json({ error: "token and password are required." });
    return;
  }
  const result = applyPasswordReset(token, password);
  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json({ ok: true });
});

// ─── Auth: token validation ───────────────────────────────────────────────────

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({ ok: true, username: req.username, authEnabled: isAuthEnabled() });
});

// ─── User data endpoints ──────────────────────────────────────────────────────

app.get("/api/user/data", requireAuth, (req, res) => {
  const username = req.username ?? "__anonymous__";
  const data = loadUserData(username);
  // Strip encrypted keys before sending to client
  const { encryptedApiKeys: _keys, ...safeData } = data;
  res.json(safeData);
});

app.post("/api/user/data", requireAuth, (req, res) => {
  const username = req.username ?? "__anonymous__";
  const { history, favoriteQueries, savedConnections, language } = req.body as {
    history?: unknown[];
    favoriteQueries?: unknown[];
    savedConnections?: unknown[];
    language?: "en" | "fr";
  };
  const current = loadUserData(username);
  saveUserData(username, {
    history: history ?? current.history,
    favoriteQueries: favoriteQueries ?? current.favoriteQueries,
    savedConnections: savedConnections ?? current.savedConnections,
    language: language ?? current.language,
    encryptedApiKeys: current.encryptedApiKeys, // preserve, never overwritten via this endpoint
  });
  res.json({ ok: true });
});

// ─── API key endpoints ────────────────────────────────────────────────────────

/** GET /api/user/api-keys — returns which providers have a key stored (no raw keys) */
app.get("/api/user/api-keys", requireAuth, (req, res) => {
  const username = req.username;
  if (!username) {
    res.json({ anthropic: false, openai: false });
    return;
  }
  res.json(getApiKeyPresence(username));
});

/** POST /api/user/api-keys — store an encrypted API key for a provider */
app.post("/api/user/api-keys", requireAuth, (req, res) => {
  const username = req.username;
  if (!username) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { provider, key } = req.body as { provider?: string; key?: string };

  if (!provider || !["anthropic", "openai"].includes(provider)) {
    res.status(400).json({ error: "provider must be 'anthropic' or 'openai'" });
    return;
  }
  if (!key?.trim()) {
    res.status(400).json({ error: "key is required" });
    return;
  }

  // Basic format validation
  if (provider === "anthropic" && !key.trim().startsWith("sk-ant-")) {
    res.status(400).json({ error: "Invalid Anthropic API key format (must start with sk-ant-)." });
    return;
  }
  if (provider === "openai" && !key.trim().startsWith("sk-")) {
    res.status(400).json({ error: "Invalid OpenAI API key format (must start with sk-)." });
    return;
  }

  try {
    setApiKey(username, provider as AiProvider, key.trim());
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: `Failed to store key: ${String(err)}` });
  }
});

/** DELETE /api/user/api-keys/:provider — remove a stored API key */
app.delete("/api/user/api-keys/:provider", requireAuth, (req, res) => {
  const username = req.username;
  if (!username) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const { provider } = req.params;
  if (!["anthropic", "openai"].includes(provider)) {
    res.status(400).json({ error: "Unknown provider" });
    return;
  }
  deleteApiKey(username, provider as AiProvider);
  res.json({ ok: true });
});

// ─── AI SQL assistant ─────────────────────────────────────────────────────────

/**
 * Resolves the API key for a given provider.
 * Only user-stored keys are accepted — no server-side env var fallback.
 * This ensures AI features require the user to configure their own key.
 */
function resolveApiKey(
  username: string | undefined,
  provider: AiProvider,
): string | null {
  if (!username) return null;
  return getDecryptedApiKey(username, provider);
}

app.post("/api/ai/sql", requireAuth, async (req, res) => {
  const { prompt, tables, engine, provider: rawProvider, model: rawModel } = req.body as {
    prompt?: string;
    tables?: { name: string; columns?: { name: string; type: string }[] }[];
    engine?: string;
    provider?: string;
    model?: string;
  };

  if (!prompt?.trim()) {
    res.status(400).json({ error: "prompt is required" });
    return;
  }

  const provider: AiProvider = rawProvider === "openai" ? "openai" : "anthropic";
  const apiKey = resolveApiKey(req.username, provider);

  if (!apiKey) {
    res.status(503).json({
      error: `No ${provider} API key configured. Add your key in Settings → API Keys.`,
    });
    return;
  }

  const schemaBlock =
    tables && tables.length > 0
      ? tables
          .map((t) => {
            const cols = t.columns?.map((c) => `  ${c.name} ${c.type}`).join("\n") ?? "";
            return `Table: ${t.name}\n${cols}`;
          })
          .join("\n\n")
      : "No schema available.";

  const systemPrompt = `You are an expert SQL assistant. The user is working with a ${engine ?? "SQL"} database.
Here is the current database schema:

${schemaBlock}

Translate the user's natural-language request into a single, valid SQL query.
Return ONLY the raw SQL — no markdown, no code fences, no explanation.`;

  try {
    if (provider === "openai") {
      const model = rawModel ?? "gpt-4o-mini";
      const client = new OpenAI({ apiKey });
      const completion = await client.chat.completions.create({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        max_tokens: 1024,
      });
      const sql = completion.choices[0]?.message?.content?.trim() ?? "";
      res.json({ sql });
    } else {
      const model = rawModel ?? "claude-haiku-4-5-20251001";
      const client = new Anthropic({ apiKey });
      const message = await client.messages.create({
        model,
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
        system: systemPrompt,
      });
      const sql = message.content
        .filter((b) => b.type === "text")
        .map((b) => (b as { type: "text"; text: string }).text)
        .join("")
        .trim();
      res.json({ sql });
    }
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── AI status ────────────────────────────────────────────────────────────────

app.get("/api/ai/status", requireAuth, (req, res) => {
  const username = req.username;
  const presence = username ? getApiKeyPresence(username) : { anthropic: false, openai: false };
  res.json({
    aiEnabled: presence.anthropic || presence.openai,
    providers: presence,
  });
});

// ─── ENI Certification prep ───────────────────────────────────────────────────

app.post("/api/cert/question", requireAuth, async (req, res) => {
  // Prefer user's Anthropic key, fall back to server env
  const apiKey = resolveApiKey(req.username, "anthropic");
  if (!apiKey) {
    res.status(503).json({ error: "AI not configured. Add an Anthropic API key in Settings → API Keys." });
    return;
  }

  const { part, type, lang } = req.body as { part?: number; type?: string; lang?: string };
  const validParts: CertPart[] = [1, 2, 3, 4];
  const validTypes: CertQuestionType[] = ["qcu", "qcm", "practical"];

  const resolvedPart: CertPart =
    validParts.includes(part as CertPart)
      ? (part as CertPart)
      : validParts[Math.floor(Math.random() * validParts.length)];
  const resolvedType: CertQuestionType =
    validTypes.includes(type as CertQuestionType)
      ? (type as CertQuestionType)
      : validTypes[Math.floor(Math.random() * validTypes.length)];
  const resolvedLang = lang === "fr" ? "fr" : "en";

  try {
    const question = await generateCertQuestion(apiKey, resolvedPart, resolvedType, resolvedLang);
    res.json({ question });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/api/cert/exam", requireAuth, async (req, res) => {
  const apiKey = resolveApiKey(req.username, "anthropic");
  if (!apiKey) {
    res.status(503).json({ error: "AI not configured. Add an Anthropic API key in Settings → API Keys." });
    return;
  }
  const { lang } = req.body as { lang?: string };
  const resolvedLang = lang === "fr" ? "fr" : "en";
  try {
    const questions = await generateExam(apiKey, resolvedLang);
    res.json({ questions });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Database engine routes ───────────────────────────────────────────────────

app.use("/api", mysqlRouter);
app.use("/api", postgresRouter);

app.post("/api/query", async (req, res) => {
  const { engine, sql, connection } = req.body;
  try {
    if (engine === "mysql" || engine === "mariadb") {
      res.json(await runMySQLQuery(sql, connection));
    } else if (engine === "postgresql") {
      res.json(await runPostgresQuery(sql, connection));
    } else {
      res.status(400).json({ error: `Unsupported engine: ${engine}` });
    }
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/api/tables", async (req, res) => {
  const { engine, connection } = req.body;
  try {
    if (engine === "mysql" || engine === "mariadb") {
      res.json({ tables: await getMySQLTables(connection) });
    } else if (engine === "postgresql") {
      res.json({ tables: await getPostgresTables(connection) });
    } else {
      res.json({ tables: [] });
    }
  } catch (err) {
    res.status(500).json({ error: String(err), tables: [] });
  }
});

app.post("/api/columns", async (req, res) => {
  const { engine, connection, tableName } = req.body;
  try {
    if (engine === "mysql" || engine === "mariadb") {
      res.json({ columns: await getMySQLColumns(connection, tableName) });
    } else if (engine === "postgresql") {
      res.json({ columns: await getPostgresColumns(connection, tableName) });
    } else {
      res.json({ columns: [] });
    }
  } catch (err) {
    res.status(500).json({ error: String(err), columns: [] });
  }
});

app.post("/api/foreign-keys", async (req, res) => {
  const { engine, connection } = req.body;
  try {
    if (engine === "mysql" || engine === "mariadb") {
      res.json({ foreignKeys: await getMySQLForeignKeys(connection) });
    } else if (engine === "postgresql") {
      res.json({ foreignKeys: await getPostgresForeignKeys(connection) });
    } else {
      res.json({ foreignKeys: [] });
    }
  } catch (err) {
    res.status(500).json({ error: String(err), foreignKeys: [] });
  }
});

app.post("/api/test-connection", async (req, res) => {
  const { engine, connection } = req.body;
  try {
    if (engine === "mysql" || engine === "mariadb") {
      res.json(await testMySQLConnection(connection));
    } else if (engine === "postgresql") {
      res.json(await testPostgresConnection(connection));
    } else {
      res.json({ ok: false, error: `Unsupported engine: ${engine}` });
    }
  } catch (err) {
    res.json({ ok: false, error: String(err) });
  }
});

// ─── Production static serving ────────────────────────────────────────────────

if (process.env.NODE_ENV === "production") {
  const distPath = path.resolve(__dirname, "../dist");

  app.use((_req, res, next) => {
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
    next();
  });

  app.use(express.static(distPath));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`SQL IDE server running on http://localhost:${PORT}`);
});
