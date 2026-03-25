import { Clock, Trash2, CheckCircle, XCircle } from 'lucide-react'
import type { HistoryEntry } from '../types'

interface QueryHistoryProps {
  history: HistoryEntry[]
  onSelect: (query: string) => void
  onClear: () => void
}

export function QueryHistory({ history, onSelect, onClear }: QueryHistoryProps) {
  if (history.length === 0) {
    return (
      <div className="p-4 text-xs text-[var(--ide-text-4)] text-center">
        <Clock size={24} className="mx-auto mb-2 opacity-30" />
        No query history yet.
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--ide-border)]">
        <span className="text-xs text-[var(--ide-text-2)]">{history.length} entries</span>
        <button
          onClick={onClear}
          className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300"
        >
          <Trash2 size={11} /> Clear
        </button>
      </div>
      <div className="overflow-y-auto flex-1">
        {history.map((entry) => (
          <div
            key={entry.id}
            onClick={() => onSelect(entry.query)}
            className="px-3 py-2 border-b border-[var(--ide-border)]/50 hover:bg-[var(--ide-surface2)] cursor-pointer group"
          >
            <div className="flex items-center gap-2 mb-1">
              {entry.success ? (
                <CheckCircle size={11} className="text-green-400 shrink-0" />
              ) : (
                <XCircle size={11} className="text-red-400 shrink-0" />
              )}
              <span className="text-xs text-[var(--ide-text-3)] uppercase font-mono">{entry.engine}</span>
              <span className="text-xs text-[var(--ide-text-4)] ml-auto">
                {new Date(entry.timestamp).toLocaleTimeString()}
              </span>
            </div>
            <div className="text-xs font-mono text-[var(--ide-text-2)] line-clamp-2 whitespace-pre-wrap">
              {entry.query}
            </div>
            {entry.rowCount !== undefined && (
              <div className="text-xs text-[var(--ide-text-4)] mt-0.5">{entry.rowCount} rows</div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
