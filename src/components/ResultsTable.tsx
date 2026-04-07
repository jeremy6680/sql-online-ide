import { useMemo, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import type { QueryResult } from '../types'
import { ChevronLeft, ChevronRight, Copy } from 'lucide-react'

const PAGE_SIZE = 100

interface ResultsTableProps {
  result: QueryResult
}

export function ResultsTable({ result }: ResultsTableProps) {
  const { t } = useTranslation()
  const [page, setPage] = useState(0)
  const [copied, setCopied] = useState<string | null>(null)

  const copy = useCallback((key: string, text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key)
      setTimeout(() => setCopied(null), 1200)
    })
  }, [])

  const pageCount = Math.ceil(result.rows.length / PAGE_SIZE)
  const pageRows = useMemo(
    () => result.rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [result.rows, page]
  )

  if (result.error) {
    return (
      <div role="alert" className="p-4 text-red-400 bg-red-900/20 rounded m-2 font-mono text-sm">
        <span className="font-bold">{t('results.error')} </span>{result.error}
      </div>
    )
  }

  if (!result.columns.length) {
    return (
      <div className="p-4 text-[var(--ide-text-2)] text-sm">
        {t('results.empty')}
        {result.executionTime > 0 && (
          <span className="ml-2 text-[var(--ide-text-3)]">({result.executionTime.toFixed(2)}ms)</span>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--ide-surface2)] border-b border-[var(--ide-border)] text-xs text-[var(--ide-text-2)]">
        <span>
          {t('results.rowCount', { count: result.rowCount })} · {t('results.colCount', { count: result.columns.length })} · {result.executionTime.toFixed(2)}ms
          {result.statementTotal && result.statementTotal > 1 && (
            <span className="ml-2 text-[var(--ide-text-3)]">
              · {t('results.statement', { index: result.statementIndex, total: result.statementTotal })}
            </span>
          )}
        </span>
        {pageCount > 1 && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="p-0.5 disabled:opacity-30 hover:text-[var(--ide-text)]"
            >
              <ChevronLeft size={14} />
            </button>
            <span>{t('results.page', { page: page + 1, total: pageCount })}</span>
            <button
              onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}
              disabled={page >= pageCount - 1}
              className="p-0.5 disabled:opacity-30 hover:text-[var(--ide-text)]"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>
      <div className="overflow-auto flex-1">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0">
            <tr className="bg-[var(--ide-surface2)]">
              <th className="w-10 px-2 py-1.5 text-right text-[var(--ide-text-3)] border-b border-r border-[var(--ide-border)] font-normal text-xs">#</th>
              {result.columns.map((col) => (
                <th key={col} className="px-3 py-1.5 text-left text-[var(--ide-accent)] font-medium border-b border-r border-[var(--ide-border)] whitespace-nowrap text-xs">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, i) => {
              const rowKey = `row-${i}`
              return (
                <tr key={i} className="hover:bg-[var(--ide-surface2)] border-b border-[var(--ide-border)]/50 group">
                  <td className="px-2 py-1 text-right text-[var(--ide-text-4)] border-r border-[var(--ide-border)]/50 text-xs">
                    <button
                      onClick={() => copy(rowKey, row.map(c => c === null ? '' : String(c)).join('\t'))}
                      title="Copy row"
                      className="opacity-0 group-hover:opacity-100 mr-1 hover:text-blue-400 transition-opacity"
                      aria-label="Copy row"
                    >
                      {copied === rowKey
                        ? <span className="text-green-400 text-[10px]">✓</span>
                        : <Copy size={10} />}
                    </button>
                    {page * PAGE_SIZE + i + 1}
                  </td>
                  {row.map((cell, j) => {
                    const cellKey = `${i}-${j}`
                    return (
                      <td
                        key={j}
                        className="px-3 py-1 border-r border-[var(--ide-border)]/50 whitespace-nowrap font-mono text-xs cursor-pointer relative"
                        onClick={() => copy(cellKey, cell === null ? '' : String(cell))}
                        title="Click to copy"
                      >
                        {cell === null ? (
                          <span className="text-[var(--ide-text-4)] italic">NULL</span>
                        ) : typeof cell === 'boolean' ? (
                          <span className={cell ? 'text-green-400' : 'text-red-400'}>{String(cell)}</span>
                        ) : typeof cell === 'number' ? (
                          <span className="text-blue-300 tabular-nums">{String(cell)}</span>
                        ) : (
                          <span className="text-[var(--ide-text)]">{String(cell)}</span>
                        )}
                        {copied === cellKey && (
                          <span className="absolute right-1 top-1/2 -translate-y-1/2 text-green-400 text-[10px]">✓</span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
