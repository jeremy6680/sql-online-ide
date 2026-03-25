import { useState } from 'react'
import { ChevronRight, ChevronDown, Table2, Eye, Columns, RefreshCw, Trash2, AlertTriangle } from 'lucide-react'
import type { TableInfo, ColumnInfo, DbEngine, RemoteConnection } from '../types'
import { getSQLiteColumns } from '../engines/sqlite'
import { getDuckDBColumns } from '../engines/duckdb'
import { getRemoteColumns } from '../engines/remote'

interface SidebarProps {
  tables: TableInfo[]
  engine: DbEngine
  remoteConnection: RemoteConnection | null
  onBrowse: (tableName: string) => void
  onDrop: (tableName: string) => void
  onRefresh: () => void
}

function TableItem({ table, engine, remoteConnection, onBrowse, onDrop }: {
  table: TableInfo
  engine: DbEngine
  remoteConnection: RemoteConnection | null
  onBrowse: (tableName: string) => void
  onDrop: (tableName: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [columns, setColumns] = useState<ColumnInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [confirmDrop, setConfirmDrop] = useState(false)

  const toggleExpand = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!expanded && !columns.length) {
      setLoading(true)
      let cols: ColumnInfo[] = []
      if (engine === 'sqlite') cols = getSQLiteColumns(table.name)
      else if (engine === 'duckdb') cols = await getDuckDBColumns(table.name)
      else if (remoteConnection) cols = await getRemoteColumns(engine, remoteConnection, table.name)
      setColumns(cols)
      setLoading(false)
    }
    setExpanded(v => !v)
  }

  if (confirmDrop) {
    return (
      <div className="px-2 py-2 bg-red-900/20 border-l-2 border-red-500">
        <div className="flex items-center gap-1 text-xs text-red-400 mb-2">
          <AlertTriangle size={11} />
          Drop <span className="font-mono font-bold">{table.name}</span>?
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => setConfirmDrop(false)}
            className="flex-1 px-2 py-1 text-xs bg-[var(--ide-surface2)] hover:bg-[var(--ide-surface3)] rounded"
          >
            Cancel
          </button>
          <button
            onClick={() => { setConfirmDrop(false); onDrop(table.name) }}
            className="flex-1 px-2 py-1 text-xs bg-red-700 hover:bg-red-600 text-white rounded font-medium"
          >
            Drop
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div
        className="flex items-center gap-1.5 px-2 py-1 hover:bg-[var(--ide-surface2)] cursor-pointer group text-sm"
        onClick={() => onBrowse(table.name)}
        title="Click to preview data"
      >
        <button
          onClick={toggleExpand}
          className="shrink-0 p-0.5 hover:bg-[var(--ide-surface3)] rounded"
        >
          {expanded
            ? <ChevronDown size={11} className="text-[var(--ide-text-3)]" />
            : <ChevronRight size={11} className="text-[var(--ide-text-3)]" />}
        </button>
        {table.type === 'view'
          ? <Eye size={13} className="text-purple-400 flex-shrink-0" />
          : <Table2 size={13} className="text-blue-400 flex-shrink-0" />}
        <span className="flex-1 truncate text-[var(--ide-text)]">{table.name}</span>

        {/* Action buttons - visible on hover */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
          <button
            onClick={(e) => { e.stopPropagation(); onBrowse(table.name) }}
            title="Browse data"
            className="p-1 rounded hover:bg-[var(--ide-surface3)] text-[var(--ide-text-3)] hover:text-blue-400"
          >
            <Eye size={11} />
          </button>
          {table.type === 'table' && (
            <button
              onClick={(e) => { e.stopPropagation(); setConfirmDrop(true) }}
              title="Drop table"
              className="p-1 rounded hover:bg-red-900/30 text-[var(--ide-text-3)] hover:text-red-400"
            >
              <Trash2 size={11} />
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="ml-5 border-l border-[var(--ide-border)]">
          {loading ? (
            <div className="px-3 py-1 text-xs text-[var(--ide-text-3)]">Loading...</div>
          ) : columns.length === 0 ? (
            <div className="px-3 py-1 text-xs text-[var(--ide-text-3)]">No columns found</div>
          ) : (
            columns.map((col) => (
              <div key={col.name} className="flex items-center gap-1.5 px-2 py-0.5 hover:bg-[var(--ide-surface2)] text-xs">
                <Columns size={11} className="text-[var(--ide-text-4)] flex-shrink-0" />
                <span className="text-[var(--ide-text-2)] flex-1 truncate">{col.name}</span>
                <span className="text-[var(--ide-text-3)] shrink-0">{col.type}</span>
                {col.pk && <span className="text-yellow-500 text-xs font-bold">PK</span>}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export function Sidebar({ tables, engine, remoteConnection, onBrowse, onDrop, onRefresh }: SidebarProps) {
  return (
    <div className="flex flex-col h-full bg-[var(--ide-surface)] border-r border-[var(--ide-border)]">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--ide-border)]">
        <span className="text-xs font-semibold text-[var(--ide-text-3)] uppercase tracking-wider">Tables</span>
        <button
          onClick={onRefresh}
          className="p-1 hover:text-[var(--ide-text)] text-[var(--ide-text-3)] hover:bg-[var(--ide-surface2)] rounded"
          title="Refresh"
        >
          <RefreshCw size={12} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {tables.length === 0 ? (
          <div className="p-3 text-xs text-[var(--ide-text-4)]">
            No tables found.<br />Run a CREATE TABLE statement to get started.
          </div>
        ) : (
          tables.map((t) => (
            <TableItem
              key={t.name}
              table={t}
              engine={engine}
              remoteConnection={remoteConnection}
              onBrowse={onBrowse}
              onDrop={onDrop}
            />
          ))
        )}
      </div>
    </div>
  )
}
