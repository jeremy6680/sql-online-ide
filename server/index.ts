import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
app.use(express.json());

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
