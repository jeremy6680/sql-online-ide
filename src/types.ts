export type DbEngine = 'sqlite' | 'duckdb' | 'mysql' | 'mariadb' | 'postgresql'

export interface QueryResult {
  columns: string[]
  rows: unknown[][]
  rowCount: number
  executionTime: number
  error?: string
}

export interface TableInfo {
  name: string
  type: 'table' | 'view'
}

export interface ColumnInfo {
  name: string
  type: string
  notnull: boolean
  pk: boolean
}

export interface HistoryEntry {
  id: string
  query: string
  engine: DbEngine
  timestamp: number
  success: boolean
  rowCount?: number
}

export interface RemoteConnection {
  host: string
  port: number
  user: string
  password: string
  database: string
}

export type ChartType = 'bar' | 'line' | 'pie' | 'bubble' | 'none'

export interface FavoriteQuery {
  id: string
  name: string
  query: string
  engine: DbEngine
  createdAt: number
}

export interface SavedConnection {
  id: string
  name: string
  engine: DbEngine
  connection: RemoteConnection
}
