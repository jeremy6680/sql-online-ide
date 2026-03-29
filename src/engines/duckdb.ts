import * as duckdb from "@duckdb/duckdb-wasm";
import type {
  QueryResult,
  TableInfo,
  ColumnInfo,
  ForeignKeyInfo,
} from "../types";

let db: duckdb.AsyncDuckDB | null = null;
let conn: duckdb.AsyncDuckDBConnection | null = null;

export async function initDuckDB(): Promise<void> {
  if (db) return;

  const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
  const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);

  const worker_url = URL.createObjectURL(
    new Blob([`importScripts("${bundle.mainWorker!}");`], {
      type: "text/javascript",
    }),
  );
  const worker = new Worker(worker_url);
  const logger = new duckdb.ConsoleLogger();
  db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  conn = await db.connect();
}

export async function runDuckDBQuery(sql: string): Promise<QueryResult> {
  if (!db || !conn) await initDuckDB();

  const start = performance.now();
  try {
    const result = await conn!.query(sql);
    const schema = result.schema;
    const columns = schema.fields.map((f: { name: string }) => f.name);
    const rows: unknown[][] = [];

    // Use toArray() for reliable row extraction
    const arrayResult = result.toArray();
    for (const row of arrayResult) {
      const rowData: unknown[] = [];
      for (const col of columns) {
        const val = (row as Record<string, unknown>)[col];
        // Convert BigInt to number for JSON serialization
        if (typeof val === "bigint") {
          rowData.push(Number(val));
        } else {
          rowData.push(val ?? null);
        }
      }
      rows.push(rowData);
    }

    const statementTotal = sql.split(';').map(s => s.trim()).filter(Boolean).length
    return {
      columns,
      rows,
      rowCount: rows.length,
      executionTime: performance.now() - start,
      ...(statementTotal > 1 ? { statementIndex: statementTotal, statementTotal } : {}),
    };
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

export async function getDuckDBTables(): Promise<TableInfo[]> {
  if (!db || !conn) return [];
  try {
    const result = await conn!.query(
      `SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = 'main' ORDER BY table_name`,
    );
    const rows: TableInfo[] = [];
    const arrayResult = result.toArray();
    for (const row of arrayResult) {
      const r = row as Record<string, unknown>;
      rows.push({
        name: String(r["table_name"] ?? ""),
        type: String(r["table_type"] ?? "") === "VIEW" ? "view" : "table",
      });
    }
    return rows;
  } catch {
    return [];
  }
}

export async function getDuckDBColumns(
  tableName: string,
): Promise<ColumnInfo[]> {
  if (!db || !conn) return [];
  try {
    const result = await conn!.query(
      `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = '${tableName}' ORDER BY ordinal_position`,
    );
    const cols: ColumnInfo[] = [];
    const arrayResult = result.toArray();
    for (const row of arrayResult) {
      const r = row as Record<string, unknown>;
      cols.push({
        name: String(r["column_name"] ?? ""),
        type: String(r["data_type"] ?? ""),
        notnull: String(r["is_nullable"] ?? "YES") === "NO",
        pk: false,
      });
    }
    return cols;
  } catch {
    return [];
  }
}

// --- Foreign key introspection ---

/**
 * Returns all FK relationships in DuckDB's 'main' schema.
 * DuckDB supports FK declarations via CREATE TABLE, but doesn't enforce them.
 * Falls back to empty array if the information_schema query fails (older DuckDB versions).
 */
export async function getDuckDBForeignKeys(): Promise<ForeignKeyInfo[]> {
  if (!db || !conn) return [];
  try {
    const result = await conn!.query(`
      SELECT
        kcu_fk.table_name   AS from_table,
        kcu_fk.column_name  AS from_column,
        kcu_pk.table_name   AS to_table,
        kcu_pk.column_name  AS to_column
      FROM information_schema.referential_constraints rc
      JOIN information_schema.key_column_usage kcu_fk
        ON  kcu_fk.constraint_name  = rc.constraint_name
        AND kcu_fk.table_schema     = rc.constraint_schema
      JOIN information_schema.key_column_usage kcu_pk
        ON  kcu_pk.constraint_name  = rc.unique_constraint_name
        AND kcu_pk.table_schema     = rc.unique_constraint_schema
        AND kcu_pk.ordinal_position = kcu_fk.ordinal_position
      WHERE rc.constraint_schema = 'main'
    `);

    const fks: ForeignKeyInfo[] = [];
    for (const row of result.toArray()) {
      const r = row as Record<string, unknown>;
      fks.push({
        fromTable: String(r["from_table"] ?? ""),
        fromColumn: String(r["from_column"] ?? ""),
        toTable: String(r["to_table"] ?? ""),
        toColumn: String(r["to_column"] ?? ""),
      });
    }
    return fks;
  } catch {
    return [];
  }
}

/**
 * Registers a local file (CSV, JSON, Parquet) into DuckDB's virtual filesystem
 * and returns the SQL snippet the user can run to import it as a table.
 * The file is registered under its original name so DuckDB read_* functions can reference it.
 */
export async function registerDuckDBFile(file: File): Promise<string> {
  if (!db) await initDuckDB();
  const fileName = file.name;
  const buffer = await file.arrayBuffer();
  await db!.registerFileBuffer(fileName, new Uint8Array(buffer));

  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  const tableName = fileName.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_]/g, '_')
  if (ext === 'parquet') {
    return `CREATE TABLE ${tableName} AS SELECT * FROM read_parquet('${fileName}');`
  } else if (ext === 'json' || ext === 'ndjson') {
    return `CREATE TABLE ${tableName} AS SELECT * FROM read_json_auto('${fileName}');`
  } else {
    // csv, tsv, txt — use auto-detect
    return `CREATE TABLE ${tableName} AS SELECT * FROM read_csv_auto('${fileName}');`
  }
}
