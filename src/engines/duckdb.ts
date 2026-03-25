import * as duckdb from '@duckdb/duckdb-wasm'
import type { QueryResult, TableInfo, ColumnInfo } from '../types'

let db: duckdb.AsyncDuckDB | null = null
let conn: duckdb.AsyncDuckDBConnection | null = null

export async function initDuckDB(): Promise<void> {
  if (db) return

  const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles()
  const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES)

  const worker_url = URL.createObjectURL(
    new Blob([`importScripts("${bundle.mainWorker!}");`], { type: 'text/javascript' })
  )
  const worker = new Worker(worker_url)
  const logger = new duckdb.ConsoleLogger()
  db = new duckdb.AsyncDuckDB(logger, worker)
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker)
  conn = await db.connect()
}

export async function runDuckDBQuery(sql: string): Promise<QueryResult> {
  if (!db || !conn) await initDuckDB()

  const start = performance.now()
  try {
    const result = await conn!.query(sql)
    const schema = result.schema
    const columns = schema.fields.map((f: { name: string }) => f.name)
    const rows: unknown[][] = []

    // Use toArray() for reliable row extraction
    const arrayResult = result.toArray()
    for (const row of arrayResult) {
      const rowData: unknown[] = []
      for (const col of columns) {
        const val = (row as Record<string, unknown>)[col]
        // Convert BigInt to number for JSON serialization
        if (typeof val === 'bigint') {
          rowData.push(Number(val))
        } else {
          rowData.push(val ?? null)
        }
      }
      rows.push(rowData)
    }

    return {
      columns,
      rows,
      rowCount: rows.length,
      executionTime: performance.now() - start
    }
  } catch (err) {
    return {
      columns: [],
      rows: [],
      rowCount: 0,
      executionTime: performance.now() - start,
      error: String(err)
    }
  }
}

export async function getDuckDBTables(): Promise<TableInfo[]> {
  if (!db || !conn) return []
  try {
    const result = await conn!.query(
      `SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = 'main' ORDER BY table_name`
    )
    const rows: TableInfo[] = []
    const arrayResult = result.toArray()
    for (const row of arrayResult) {
      const r = row as Record<string, unknown>
      rows.push({
        name: String(r['table_name'] ?? ''),
        type: String(r['table_type'] ?? '') === 'VIEW' ? 'view' : 'table'
      })
    }
    return rows
  } catch {
    return []
  }
}

export async function getDuckDBColumns(tableName: string): Promise<ColumnInfo[]> {
  if (!db || !conn) return []
  try {
    const result = await conn!.query(
      `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = '${tableName}' ORDER BY ordinal_position`
    )
    const cols: ColumnInfo[] = []
    const arrayResult = result.toArray()
    for (const row of arrayResult) {
      const r = row as Record<string, unknown>
      cols.push({
        name: String(r['column_name'] ?? ''),
        type: String(r['data_type'] ?? ''),
        notnull: String(r['is_nullable'] ?? 'YES') === 'NO',
        pk: false
      })
    }
    return cols
  } catch {
    return []
  }
}
