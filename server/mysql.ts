import { Router } from "express";
import mysql from "mysql2/promise";

export const mysqlRouter = Router();

export interface DBConnection {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

async function getConnection(connection: DBConnection) {
  return mysql.createConnection({
    host: connection.host,
    port: connection.port,
    user: connection.user,
    password: connection.password,
    database: connection.database,
    connectTimeout: 5000,
    multipleStatements: true,
  });
}

type FieldPacket = { name: string };

function extractLastResult(
  rows: unknown,
  fields: unknown,
): { lastRows: unknown; lastFields: FieldPacket[] | undefined } {
  // With multipleStatements: true, mysql2 returns an array of per-statement results
  // Each element is either RowDataPacket[] (SELECT) or ResultSetHeader (DDL/DML)
  // fields is a parallel array where each entry is FieldPacket[] or undefined
  const isMulti =
    Array.isArray(rows) &&
    rows.length > 0 &&
    (Array.isArray(rows[0]) ||
      (typeof rows[0] === "object" &&
        rows[0] !== null &&
        "fieldCount" in (rows[0] as object) &&
        !(
          "constructor" in
          ((rows[0] as object) && (rows[0] as Record<string, unknown>))
        )));

  if (isMulti) {
    const allRows = rows as unknown[];
    const allFields = (Array.isArray(fields) ? fields : []) as (
      | FieldPacket[]
      | undefined
    )[];
    // Find last SELECT result (has fields), fallback to last DML
    for (let i = allRows.length - 1; i >= 0; i--) {
      const f = allFields[i];
      if (Array.isArray(f) && f.length > 0 && f[0]?.name !== undefined) {
        return { lastRows: allRows[i], lastFields: f };
      }
    }
    // No SELECT found — return last DML affected_rows
    return { lastRows: allRows[allRows.length - 1], lastFields: undefined };
  }

  return {
    lastRows: rows,
    lastFields:
      Array.isArray(fields) &&
      fields.length > 0 &&
      (fields[0] as FieldPacket)?.name !== undefined
        ? (fields as FieldPacket[])
        : undefined,
  };
}

export async function runMySQLQuery(sql: string, connection: DBConnection) {
  const start = Date.now();
  let conn;
  try {
    conn = await getConnection(connection);
    const [rows, fields] = (await conn.query(sql)) as [unknown, unknown];
    const { lastRows, lastFields } = extractLastResult(rows, fields);

    if (lastFields && Array.isArray(lastFields) && lastFields.length > 0) {
      const columns = lastFields.map((c) => c.name);
      const data = Array.isArray(lastRows)
        ? (lastRows as Record<string, unknown>[]).map((r) =>
            columns.map((c) => r[c]),
          )
        : [];
      return {
        columns,
        rows: data,
        rowCount: data.length,
        executionTime: Date.now() - start,
      };
    } else {
      const result = (
        Array.isArray(lastRows) ? lastRows[lastRows.length - 1] : lastRows
      ) as { affectedRows?: number };
      return {
        columns: ["affected_rows"],
        rows: [[result?.affectedRows ?? 0]],
        rowCount: 1,
        executionTime: Date.now() - start,
      };
    }
  } finally {
    await conn?.end();
  }
}

export async function getMySQLTables(connection: DBConnection) {
  let conn;
  try {
    conn = await getConnection(connection);
    const [rows] = (await conn.execute(
      `SELECT TABLE_NAME, TABLE_TYPE FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME`,
    )) as [{ TABLE_NAME: string; TABLE_TYPE: string }[][], unknown];
    return (
      rows as unknown as { TABLE_NAME: string; TABLE_TYPE: string }[]
    ).map((r) => ({
      name: r.TABLE_NAME,
      type: r.TABLE_TYPE === "VIEW" ? "view" : "table",
    }));
  } finally {
    await conn?.end();
  }
}

export async function getMySQLColumns(
  connection: DBConnection,
  tableName: string,
) {
  let conn;
  try {
    conn = await getConnection(connection);
    const [rows] = (await conn.execute(
      `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_KEY FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION`,
      [tableName],
    )) as [
      {
        COLUMN_NAME: string;
        DATA_TYPE: string;
        IS_NULLABLE: string;
        COLUMN_KEY: string;
      }[][],
      unknown,
    ];
    return (
      rows as unknown as {
        COLUMN_NAME: string;
        DATA_TYPE: string;
        IS_NULLABLE: string;
        COLUMN_KEY: string;
      }[]
    ).map((r) => ({
      name: r.COLUMN_NAME,
      type: r.DATA_TYPE,
      notnull: r.IS_NULLABLE === "NO",
      pk: r.COLUMN_KEY === "PRI",
    }));
  } finally {
    await conn?.end();
  }
}

export async function testMySQLConnection(connection: DBConnection) {
  let conn;
  try {
    conn = await getConnection(connection);
    await conn.ping();
    return { ok: true };
  } finally {
    await conn?.end();
  }
}

mysqlRouter.post("/query-mysql", async (req, res) => {
  const { sql, connection } = req.body;
  try {
    const result = await runMySQLQuery(sql, connection);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

mysqlRouter.post("/tables-mysql", async (req, res) => {
  const { connection } = req.body;
  try {
    const tables = await getMySQLTables(connection);
    res.json({ tables });
  } catch (err) {
    res.status(500).json({ error: String(err), tables: [] });
  }
});

mysqlRouter.post("/columns-mysql", async (req, res) => {
  const { connection, tableName } = req.body;
  try {
    const columns = await getMySQLColumns(connection, tableName);
    res.json({ columns });
  } catch (err) {
    res.status(500).json({ error: String(err), columns: [] });
  }
});

mysqlRouter.post("/test-connection-mysql", async (req, res) => {
  const { connection } = req.body;
  try {
    const result = await testMySQLConnection(connection);
    res.json(result);
  } catch (err) {
    res.json({ ok: false, error: String(err) });
  }
});

/**
 * Fetches all FK relationships for the current MySQL/MariaDB database.
 * Uses INFORMATION_SCHEMA.KEY_COLUMN_USAGE filtered by REFERENCED_TABLE_NAME IS NOT NULL.
 */
export async function getMySQLForeignKeys(connection: DBConnection) {
  let conn;
  try {
    conn = await getConnection(connection);
    const [rows] = (await conn.execute(`
      SELECT
        TABLE_NAME        AS from_table,
        COLUMN_NAME       AS from_column,
        REFERENCED_TABLE_NAME  AS to_table,
        REFERENCED_COLUMN_NAME AS to_column
      FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE()
        AND REFERENCED_TABLE_NAME IS NOT NULL
      ORDER BY TABLE_NAME, COLUMN_NAME
    `)) as [
      {
        from_table: string;
        from_column: string;
        to_table: string;
        to_column: string;
      }[][],
      unknown,
    ];

    return (
      rows as unknown as {
        from_table: string;
        from_column: string;
        to_table: string;
        to_column: string;
      }[]
    ).map((r) => ({
      fromTable: r.from_table,
      fromColumn: r.from_column,
      toTable: r.to_table,
      toColumn: r.to_column,
    }));
  } finally {
    await conn?.end();
  }
}
