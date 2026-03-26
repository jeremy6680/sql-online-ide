import { Router } from "express";
import { Client } from "pg";

export const postgresRouter = Router();

export interface DBConnection {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

async function getClient(connection: DBConnection) {
  const client = new Client({
    host: connection.host,
    port: connection.port,
    user: connection.user,
    password: connection.password,
    database: connection.database,
    connectionTimeoutMillis: 5000,
  });
  await client.connect();
  return client;
}

export async function runPostgresQuery(sql: string, connection: DBConnection) {
  const start = Date.now();
  let client;
  try {
    client = await getClient(connection);
    const result = await client.query(sql);
    const columns = result.fields.map((f) => f.name);
    const rows = result.rows.map((r) => columns.map((c) => r[c]));
    return {
      columns,
      rows,
      rowCount: rows.length,
      executionTime: Date.now() - start,
    };
  } finally {
    await client?.end();
  }
}

export async function getPostgresTables(connection: DBConnection) {
  let client;
  try {
    client = await getClient(connection);
    const result = await client.query(
      `SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
    );
    return result.rows.map((r) => ({
      name: r.table_name as string,
      type: (r.table_type === "VIEW" ? "view" : "table") as "table" | "view",
    }));
  } finally {
    await client?.end();
  }
}

export async function getPostgresColumns(
  connection: DBConnection,
  tableName: string,
) {
  let client;
  try {
    client = await getClient(connection);
    const result = await client.query(
      `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`,
      [tableName],
    );
    return result.rows.map((r) => ({
      name: r.column_name as string,
      type: r.data_type as string,
      notnull: r.is_nullable === "NO",
      pk: false,
    }));
  } finally {
    await client?.end();
  }
}

export async function testPostgresConnection(connection: DBConnection) {
  let client;
  try {
    client = await getClient(connection);
    await client.query("SELECT 1");
    return { ok: true };
  } finally {
    await client?.end();
  }
}

postgresRouter.post("/query-pg", async (req, res) => {
  const { sql, connection } = req.body;
  try {
    const result = await runPostgresQuery(sql, connection);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

postgresRouter.post("/tables-pg", async (req, res) => {
  const { connection } = req.body;
  try {
    const tables = await getPostgresTables(connection);
    res.json({ tables });
  } catch (err) {
    res.status(500).json({ error: String(err), tables: [] });
  }
});

postgresRouter.post("/columns-pg", async (req, res) => {
  const { connection, tableName } = req.body;
  try {
    const columns = await getPostgresColumns(connection, tableName);
    res.json({ columns });
  } catch (err) {
    res.status(500).json({ error: String(err), columns: [] });
  }
});

postgresRouter.post("/test-connection-pg", async (req, res) => {
  const { connection } = req.body;
  try {
    const result = await testPostgresConnection(connection);
    res.json(result);
  } catch (err) {
    res.json({ ok: false, error: String(err) });
  }
});

/**
 * Fetches all FK relationships in the PostgreSQL 'public' schema.
 * Joins pg_constraint, pg_class, pg_attribute for full column-level detail.
 */
export async function getPostgresForeignKeys(connection: DBConnection) {
  let client;
  try {
    client = await getClient(connection);
    const result = await client.query(`
      SELECT
        src_tbl.relname  AS from_table,
        src_col.attname  AS from_column,
        tgt_tbl.relname  AS to_table,
        tgt_col.attname  AS to_column
      FROM pg_constraint c
      JOIN pg_class   src_tbl ON src_tbl.oid = c.conrelid
      JOIN pg_class   tgt_tbl ON tgt_tbl.oid = c.confrelid
      JOIN pg_attribute src_col
        ON  src_col.attrelid = c.conrelid
        AND src_col.attnum   = ANY(c.conkey)
      JOIN pg_attribute tgt_col
        ON  tgt_col.attrelid = c.confrelid
        AND tgt_col.attnum   = ANY(c.confkey)
      JOIN pg_namespace ns ON ns.oid = src_tbl.relnamespace
      WHERE c.contype = 'f'
        AND ns.nspname = 'public'
      ORDER BY src_tbl.relname, src_col.attname
    `);
    return result.rows.map((r) => ({
      fromTable: r.from_table as string,
      fromColumn: r.from_column as string,
      toTable: r.to_table as string,
      toColumn: r.to_column as string,
    }));
  } finally {
    await client?.end();
  }
}
