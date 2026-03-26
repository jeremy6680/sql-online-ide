import initSqlJs, { type Database } from "sql.js";
import type {
  QueryResult,
  TableInfo,
  ColumnInfo,
  ForeignKeyInfo,
} from "../types";

let db: Database | null = null;

export async function initSQLite(): Promise<void> {
  const SQL = await initSqlJs({
    locateFile: () => "/sql-wasm.wasm",
  });
  db = new SQL.Database();
}

export async function loadSQLiteFile(buffer: ArrayBuffer): Promise<void> {
  const SQL = await initSqlJs({
    locateFile: () => "/sql-wasm.wasm",
  });
  db = new SQL.Database(new Uint8Array(buffer));
}

export function exportSQLiteDB(): Uint8Array | null {
  return db ? db.export() : null;
}

export async function runSQLiteQuery(sql: string): Promise<QueryResult> {
  if (!db) await initSQLite();

  const start = performance.now();
  try {
    // Execute all statements, take the last result
    // SQLite does not support ALTER TABLE ADD FOREIGN KEY — skip those silently
    const statements = sql
      .split(";")
      .map((s) => s.trim())
      .filter((s) => {
        if (!s) return false;
        const upper = s.toUpperCase().replace(/\s+/g, " ");
        if (upper.includes("ALTER TABLE") && upper.includes("ADD FOREIGN KEY"))
          return false;
        if (
          upper.includes("ALTER TABLE") &&
          upper.includes("ADD CONSTRAINT") &&
          upper.includes("FOREIGN KEY")
        )
          return false;
        return true;
      });
    let lastResult: QueryResult = {
      columns: [],
      rows: [],
      rowCount: 0,
      executionTime: 0,
    };

    for (const stmt of statements) {
      if (!stmt) continue;
      const results = db!.exec(stmt);
      if (results.length > 0) {
        const r = results[0];
        lastResult = {
          columns: r.columns,
          rows: r.values,
          rowCount: r.values.length,
          executionTime: 0,
        };
      } else {
        // DML statement
        lastResult = {
          columns: ["affected_rows"],
          rows: [[db!.getRowsModified()]],
          rowCount: 1,
          executionTime: 0,
        };
      }
    }

    lastResult.executionTime = performance.now() - start;
    return lastResult;
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

export function getSQLiteTables(): TableInfo[] {
  if (!db) return [];
  try {
    const results = db.exec(
      `SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name`,
    );
    if (!results.length) return [];
    return results[0].values.map(([name, type]) => ({
      name: String(name),
      type: type === "view" ? "view" : "table",
    })) as TableInfo[];
  } catch {
    return [];
  }
}

export function getSQLiteColumns(tableName: string): ColumnInfo[] {
  if (!db) return [];
  try {
    const results = db.exec(`PRAGMA table_info("${tableName}")`);
    if (!results.length) return [];
    return results[0].values.map((row) => ({
      name: String(row[1]),
      type: String(row[2]),
      notnull: Boolean(row[3]),
      pk: Boolean(row[5]),
    }));
  } catch {
    return [];
  }
}

/**
 * Returns all foreign key relationships across all user tables.
 * Uses PRAGMA foreign_key_list per table — SQLite stores FK info table-by-table.
 * Note: FKs are declared but not enforced by default in SQLite (PRAGMA foreign_keys = ON).
 */
export function getSQLiteForeignKeys(): ForeignKeyInfo[] {
  if (!db) return [];
  const fks: ForeignKeyInfo[] = [];
  try {
    const tables = db.exec(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
    );
    if (!tables.length) return [];

    for (const [tableName] of tables[0].values) {
      const result = db.exec(`PRAGMA foreign_key_list("${String(tableName)}")`);
      if (!result.length) continue;

      // PRAGMA columns: id, seq, table, from, to, on_update, on_delete, match
      for (const row of result[0].values) {
        fks.push({
          fromTable: String(tableName),
          fromColumn: String(row[3]), // "from" column in child table
          toTable: String(row[2]), // referenced parent table
          toColumn: String(row[4]), // referenced column in parent table
        });
      }
    }
  } catch {
    // Best-effort — never throw from introspection
  }
  return fks;
}
