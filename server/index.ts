import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import Anthropic from "@anthropic-ai/sdk";
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
} from "./auth.js";
import { loadUserData, saveUserData } from "./userData.js";
import { generateCertQuestion, generateExam } from "./cert.js";
import type { CertPart, CertQuestionType } from "../src/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
app.use(express.json());

// Auth: public status — lets the frontend know if login is required
app.get("/api/auth/status", (_req, res) => {
  res.json({ authEnabled: isAuthEnabled() });
});

// Auth: login endpoint (public)
app.post("/api/auth/login", (req, res) => {
  if (!isAuthEnabled()) {
    res.json({ token: null, username: null, authEnabled: false });
    return;
  }
  const { username, password } = req.body as { username?: string; password?: string };
  if (!username || !password) {
    res.status(400).json({ error: "username and password are required" });
    return;
  }
  if (!validateCredentials(username, password)) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  res.json({ token: signToken(username), username, authEnabled: true });
});

// Auth: verify endpoint — lets the frontend check if a stored token is still valid
// requireAuth is applied here so an expired token returns 401
app.get("/api/auth/me", requireAuth, (_req, res) => {
  res.json({ ok: true, authEnabled: isAuthEnabled() });
});

// ─── User data endpoints (auth required) ─────────────────────────────────────

// GET /api/user/data — returns this user's persisted history + favorites
app.get("/api/user/data", requireAuth, (req, res) => {
  // When auth is disabled, username is undefined — return empty data
  const username = req.username ?? "__anonymous__";
  res.json(loadUserData(username));
});

// POST /api/user/data — replaces this user's history, favorites, and saved connections
app.post("/api/user/data", requireAuth, (req, res) => {
  const username = req.username ?? "__anonymous__";
  const { history, favoriteQueries, savedConnections } = req.body as {
    history?: unknown[];
    favoriteQueries?: unknown[];
    savedConnections?: unknown[];
  };
  const current = loadUserData(username);
  saveUserData(username, {
    history: history ?? current.history,
    favoriteQueries: favoriteQueries ?? current.favoriteQueries,
    savedConnections: savedConnections ?? current.savedConnections,
  });
  res.json({ ok: true });
});

// ─── AI SQL assistant endpoint ────────────────────────────────────────────────

// POST /api/ai/sql — translates a natural-language prompt into SQL
// Requires ANTHROPIC_API_KEY env var; returns 503 if not configured.
app.post("/api/ai/sql", requireAuth, async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: "AI assistant is not configured (missing ANTHROPIC_API_KEY)." });
    return;
  }

  const { prompt, tables, engine } = req.body as {
    prompt?: string;
    tables?: { name: string; columns?: { name: string; type: string }[] }[];
    engine?: string;
  };

  if (!prompt?.trim()) {
    res.status(400).json({ error: "prompt is required" });
    return;
  }

  const schemaBlock = tables && tables.length > 0
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
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
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
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── AI status endpoint ───────────────────────────────────────────────────────

// GET /api/ai/status — lets the frontend know if AI is available
app.get("/api/ai/status", (_req, res) => {
  res.json({ aiEnabled: !!process.env.ANTHROPIC_API_KEY });
});

// ─── ENI SQL Certification prep endpoint ─────────────────────────────────────

// POST /api/cert/question — generates a random ENI SQL exam question via Claude
app.post("/api/cert/question", requireAuth, async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: "AI non configuré (ANTHROPIC_API_KEY manquante)." });
    return;
  }

  const { part, type } = req.body as { part?: number; type?: string };

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

  try {
    const question = await generateCertQuestion(apiKey, resolvedPart, resolvedType);
    res.json({ question });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/cert/exam — generates 20 questions for a mock exam (parallel)
app.post("/api/cert/exam", requireAuth, async (_req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: "AI non configuré (ANTHROPIC_API_KEY manquante)." });
    return;
  }
  try {
    const questions = await generateExam(apiKey);
    res.json({ questions });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Mount engine-specific routers
app.use("/api", mysqlRouter);
app.use("/api", postgresRouter);

// Unified query endpoint - routes based on engine
app.post("/api/query", async (req, res) => {
  const { engine, sql, connection } = req.body;
  try {
    if (engine === "mysql" || engine === "mariadb") {
      const result = await runMySQLQuery(sql, connection);
      res.json(result);
    } else if (engine === "postgresql") {
      const result = await runPostgresQuery(sql, connection);
      res.json(result);
    } else {
      res.status(400).json({ error: `Unsupported engine: ${engine}` });
    }
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Unified tables endpoint
app.post("/api/tables", async (req, res) => {
  const { engine, connection } = req.body;
  try {
    if (engine === "mysql" || engine === "mariadb") {
      const tables = await getMySQLTables(connection);
      res.json({ tables });
    } else if (engine === "postgresql") {
      const tables = await getPostgresTables(connection);
      res.json({ tables });
    } else {
      res.json({ tables: [] });
    }
  } catch (err) {
    res.status(500).json({ error: String(err), tables: [] });
  }
});

// Unified columns endpoint
app.post("/api/columns", async (req, res) => {
  const { engine, connection, tableName } = req.body;
  try {
    if (engine === "mysql" || engine === "mariadb") {
      const columns = await getMySQLColumns(connection, tableName);
      res.json({ columns });
    } else if (engine === "postgresql") {
      const columns = await getPostgresColumns(connection, tableName);
      res.json({ columns });
    } else {
      res.json({ columns: [] });
    }
  } catch (err) {
    res.status(500).json({ error: String(err), columns: [] });
  }
});

// Unified foreign-keys endpoint — returns all FK relationships in the database
app.post("/api/foreign-keys", async (req, res) => {
  const { engine, connection } = req.body;
  try {
    if (engine === "mysql" || engine === "mariadb") {
      const fks = await getMySQLForeignKeys(connection);
      res.json({ foreignKeys: fks });
    } else if (engine === "postgresql") {
      const fks = await getPostgresForeignKeys(connection);
      res.json({ foreignKeys: fks });
    } else {
      res.json({ foreignKeys: [] });
    }
  } catch (err) {
    res.status(500).json({ error: String(err), foreignKeys: [] });
  }
});

// Unified test-connection endpoint
app.post("/api/test-connection", async (req, res) => {
  const { engine, connection } = req.body;
  try {
    if (engine === "mysql" || engine === "mariadb") {
      const result = await testMySQLConnection(connection);
      res.json(result);
    } else if (engine === "postgresql") {
      const result = await testPostgresConnection(connection);
      res.json(result);
    } else {
      res.json({ ok: false, error: `Unsupported engine: ${engine}` });
    }
  } catch (err) {
    res.json({ ok: false, error: String(err) });
  }
});

// In production, Express serves the Vite-built frontend
if (process.env.NODE_ENV === "production") {
  const distPath = path.resolve(__dirname, "../dist");

  // Required for DuckDB WASM: enables SharedArrayBuffer in the browser
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
