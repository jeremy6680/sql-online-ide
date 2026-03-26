// src/engines/remote.ts

import type {
  QueryResult,
  TableInfo,
  ColumnInfo,
  ForeignKeyInfo,
  DbEngine,
  RemoteConnection,
} from "../types";

interface RemoteQueryPayload {
  engine: DbEngine;
  sql: string;
  connection: RemoteConnection;
}

export async function runRemoteQuery(
  payload: RemoteQueryPayload,
): Promise<QueryResult> {
  const start = performance.now();
  try {
    const res = await fetch("/api/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Query failed");
    return { ...data, executionTime: performance.now() - start };
  } catch (err) {
    return {
      columns: [],
      rows: [],
      rowCount: 0,
      executionTime: performance.now() - start,
      error: String(err),
    };
  }
}

export async function getRemoteTables(
  engine: DbEngine,
  connection: RemoteConnection,
): Promise<TableInfo[]> {
  try {
    const res = await fetch("/api/tables", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ engine, connection }),
    });
    const data = await res.json();
    return data.tables || [];
  } catch {
    return [];
  }
}

export async function getRemoteColumns(
  engine: DbEngine,
  connection: RemoteConnection,
  tableName: string,
): Promise<ColumnInfo[]> {
  try {
    const res = await fetch("/api/columns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ engine, connection, tableName }),
    });
    const data = await res.json();
    return data.columns || [];
  } catch {
    return [];
  }
}

/**
 * Fetches all foreign key relationships for a remote database.
 * Calls the /api/foreign-keys endpoint (to be added to server/index.ts).
 */
export async function getRemoteForeignKeys(
  engine: DbEngine,
  connection: RemoteConnection,
): Promise<ForeignKeyInfo[]> {
  try {
    const res = await fetch("/api/foreign-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ engine, connection }),
    });
    const data = await res.json();
    return data.foreignKeys || [];
  } catch {
    return [];
  }
}
