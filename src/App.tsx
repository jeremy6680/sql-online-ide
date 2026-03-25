import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Upload, Download, Clock, ChevronLeft, ChevronRight, Database, BarChart2, TableIcon, Star, Sun, Moon } from 'lucide-react'
import { Editor } from './components/Editor'
import { ResultsTable } from './components/ResultsTable'
import { ChartView } from './components/ChartView'
import { Sidebar } from './components/Sidebar'
import { QueryHistory } from './components/QueryHistory'
import { FavoritesPanel } from './components/FavoritesPanel'
import { ConnectionModal } from './components/ConnectionModal'
import { useStore } from './store'
import { initSQLite, runSQLiteQuery, getSQLiteTables, loadSQLiteFile } from './engines/sqlite'
import { initDuckDB, runDuckDBQuery, getDuckDBTables } from './engines/duckdb'
import { runRemoteQuery, getRemoteTables } from './engines/remote'
import type { DbEngine, ChartType, RemoteConnection, SavedConnection } from './types'
import * as XLSX from 'xlsx'

const ENGINE_LABELS: Record<DbEngine, { label: string; color: string; wasm: boolean }> = {
  sqlite:     { label: 'SQLite',     color: 'bg-blue-600',   wasm: true },
  duckdb:     { label: 'DuckDB',     color: 'bg-yellow-600', wasm: true },
  mysql:      { label: 'MySQL',      color: 'bg-orange-600', wasm: false },
  mariadb:    { label: 'MariaDB',    color: 'bg-teal-600',   wasm: false },
  postgresql: { label: 'PostgreSQL', color: 'bg-indigo-600', wasm: false },
}

export default function App() {
  const {
    engine, setEngine,
    sql, setSql,
    result, setResult,
    isLoading, setIsLoading,
    tables, setTables,
    history, addHistory, clearHistory,
    remoteConnection, setRemoteConnection,
    chartType, setChartType,
    showHistory, toggleHistory,
    showSidebar, toggleSidebar,
    favoriteQueries, addFavoriteQuery, removeFavoriteQuery,
    savedConnections, addSavedConnection, removeSavedConnection,
    theme, toggleTheme,
  } = useStore()

  const [activeResultTab, setActiveResultTab] = useState<'table' | 'chart'>('table')
  const [showConnectionModal, setShowConnectionModal] = useState(false)
  const [initialized, setInitialized] = useState(false)
  const [rightPanelTab, setRightPanelTab] = useState<'history' | 'favorites'>('history')
  const [showFavNameInput, setShowFavNameInput] = useState(false)
  const [favName, setFavName] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const runRef = useRef<() => void>(() => {})

  // Initialize default engine
  useEffect(() => {
    if (initialized) return
    setInitialized(true)
    initSQLite().then(() => {
      setTables(getSQLiteTables())
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const refreshTables = useCallback(async () => {
    if (engine === 'sqlite') {
      setTables(getSQLiteTables())
    } else if (engine === 'duckdb') {
      setTables(await getDuckDBTables())
    } else if (remoteConnection) {
      setTables(await getRemoteTables(engine, remoteConnection))
    }
  }, [engine, remoteConnection, setTables])

  const handleRun = useCallback(async () => {
    if (!sql.trim()) return
    setIsLoading(true)
    setResult(null)

    let res
    if (engine === 'sqlite') {
      res = await runSQLiteQuery(sql)
    } else if (engine === 'duckdb') {
      await initDuckDB()
      res = await runDuckDBQuery(sql)
    } else if (remoteConnection) {
      res = await runRemoteQuery({ engine, sql, connection: remoteConnection })
    } else {
      setShowConnectionModal(true)
      setIsLoading(false)
      return
    }

    setResult(res)
    setIsLoading(false)

    addHistory({
      id: crypto.randomUUID(),
      query: sql,
      engine,
      timestamp: Date.now(),
      success: !res.error,
      rowCount: res.rowCount
    })

    await refreshTables()
  }, [sql, engine, remoteConnection, setIsLoading, setResult, addHistory, refreshTables])

  runRef.current = handleRun

  const handleEngineChange = async (e: DbEngine) => {
    setEngine(e)
    setResult(null)
    setTables([])
    if (e === 'sqlite') {
      await initSQLite()
      setTables(getSQLiteTables())
    } else if (e === 'duckdb') {
      await initDuckDB()
      setTables(await getDuckDBTables())
    } else {
      setShowConnectionModal(true)
    }
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const ext = file.name.split('.').pop()?.toLowerCase()

    if (ext === 'db' || ext === 'sqlite' || ext === 'sqlite3') {
      const buf = await file.arrayBuffer()
      await loadSQLiteFile(buf)
      setEngine('sqlite')
      setTables(getSQLiteTables())
    } else if (ext === 'sql') {
      const text = await file.text()
      setSql(text)
    }
    e.target.value = ''
  }

  const handleExportXLSX = () => {
    if (!result || result.error || !result.columns.length) return
    const ws = XLSX.utils.aoa_to_sheet([result.columns, ...result.rows.map(r => r.map(String))])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Results')
    XLSX.writeFile(wb, `query_results_${Date.now()}.xlsx`)
  }

  // MySQL/MariaDB use backticks, others use double quotes
  const quoteIdent = useCallback((name: string) =>
    (engine === 'mysql' || engine === 'mariadb') ? `\`${name}\`` : `"${name}"`
  , [engine])

  const handleBrowseTable = useCallback(async (tableName: string) => {
    const browseSQL = `SELECT * FROM ${quoteIdent(tableName)} LIMIT 200`
    setIsLoading(true)
    setResult(null)
    let res
    if (engine === 'sqlite') res = await runSQLiteQuery(browseSQL)
    else if (engine === 'duckdb') { await initDuckDB(); res = await runDuckDBQuery(browseSQL) }
    else if (remoteConnection) res = await runRemoteQuery({ engine, sql: browseSQL, connection: remoteConnection })
    if (res) setResult(res)
    setIsLoading(false)
  }, [engine, remoteConnection, quoteIdent, setIsLoading, setResult])

  const handleDropTable = useCallback(async (tableName: string) => {
    const dropSQL = `DROP TABLE ${quoteIdent(tableName)}`
    if (engine === 'sqlite') await runSQLiteQuery(dropSQL)
    else if (engine === 'duckdb') { await initDuckDB(); await runDuckDBQuery(dropSQL) }
    else if (remoteConnection) await runRemoteQuery({ engine, sql: dropSQL, connection: remoteConnection })
    await refreshTables()
  }, [engine, remoteConnection, quoteIdent, refreshTables])

  const handleSaveFavorite = () => {
    if (!favName.trim()) return
    addFavoriteQuery({
      id: crypto.randomUUID(),
      name: favName.trim(),
      query: sql,
      engine,
      createdAt: Date.now(),
    })
    setFavName('')
    setShowFavNameInput(false)
    setRightPanelTab('favorites')
    if (!showHistory) toggleHistory()
  }

  return (
    <div
      className={`flex flex-col h-screen select-none ${theme === 'dark' ? 'dark' : ''}`}
      style={{ background: 'var(--ide-bg)', color: 'var(--ide-text)' }}
    >
      {/* Top Toolbar */}
      <header className="flex items-center gap-2 px-3 py-2 border-b border-[var(--ide-border)] shrink-0" style={{ background: 'var(--ide-surface)' }}>
        {/* Logo */}
        <div className="flex items-center gap-2 mr-3">
          <Database size={18} className="text-blue-400" />
          <span className="font-bold text-sm text-[var(--ide-text)]">SQL IDE</span>
        </div>

        {/* Engine Selector */}
        <div className="flex items-center gap-1 rounded-lg p-0.5 border border-[var(--ide-border)]" style={{ background: 'var(--ide-bg)' }}>
          {(Object.keys(ENGINE_LABELS) as DbEngine[]).map((e) => (
            <button
              key={e}
              onClick={() => handleEngineChange(e)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                engine === e
                  ? `${ENGINE_LABELS[e].color} text-white shadow`
                  : 'text-[var(--ide-text-2)] hover:text-[var(--ide-text)] hover:bg-[var(--ide-surface2)]'
              }`}
            >
              {ENGINE_LABELS[e].label}
              {ENGINE_LABELS[e].wasm && (
                <span className="ml-1 text-[9px] opacity-60">WASM</span>
              )}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* Actions */}
        <button
          onClick={handleRun}
          disabled={isLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-500 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors text-white"
        >
          <Play size={13} fill="currentColor" />
          Run
          <span className="text-xs opacity-60 ml-0.5">⌘↵</span>
        </button>

        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--ide-surface2)] hover:bg-[var(--ide-surface3)] border border-[var(--ide-border)] rounded-lg text-sm transition-colors"
        >
          <Upload size={13} />
          Import
        </button>
        <input ref={fileInputRef} type="file" accept=".db,.sqlite,.sqlite3,.sql" className="hidden" onChange={handleImport} />

        <button
          onClick={handleExportXLSX}
          disabled={!result || !!result.error || !result.columns.length}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--ide-surface2)] hover:bg-[var(--ide-surface3)] border border-[var(--ide-border)] rounded-lg text-sm transition-colors disabled:opacity-40"
        >
          <Download size={13} />
          Export XLSX
        </button>

        {/* Star / save favorite */}
        {showFavNameInput ? (
          <div className="flex items-center gap-1">
            <input
              autoFocus
              className="bg-[var(--ide-surface)] border border-yellow-500/60 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-yellow-400 w-44 text-[var(--ide-text)]"
              placeholder="Favorite name…"
              value={favName}
              onChange={e => setFavName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSaveFavorite(); if (e.key === 'Escape') setShowFavNameInput(false) }}
            />
            <button
              onClick={handleSaveFavorite}
              disabled={!favName.trim()}
              className="px-2 py-1.5 bg-yellow-600 hover:bg-yellow-500 rounded-lg text-sm disabled:opacity-40"
            >
              <Star size={13} fill="currentColor" />
            </button>
            <button onClick={() => setShowFavNameInput(false)} className="text-[var(--ide-text-3)] hover:text-[var(--ide-text)] px-1">✕</button>
          </div>
        ) : (
          <button
            onClick={() => setShowFavNameInput(true)}
            title="Save as favorite"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--ide-surface2)] hover:bg-[var(--ide-surface3)] border border-[var(--ide-border)] rounded-lg text-sm transition-colors text-yellow-400 hover:text-yellow-300"
          >
            <Star size={13} />
          </button>
        )}

        <button
          onClick={toggleHistory}
          className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-sm transition-colors ${
            showHistory ? 'bg-blue-600/20 border-blue-500 text-blue-300' : 'bg-[var(--ide-surface2)] border-[var(--ide-border)] hover:bg-[var(--ide-surface3)]'
          }`}
        >
          <Clock size={13} />
          History
        </button>

        <button
          onClick={toggleTheme}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--ide-surface2)] hover:bg-[var(--ide-surface3)] border border-[var(--ide-border)] rounded-lg text-sm transition-colors"
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
        </button>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Sidebar toggle button when hidden */}
        {!showSidebar && (
          <button
            onClick={toggleSidebar}
            className="absolute left-0 top-1/2 z-10 -translate-y-1/2 bg-[var(--ide-surface2)] border border-[var(--ide-border)] p-0.5 rounded-r"
          >
            <ChevronRight size={12} />
          </button>
        )}

        {/* Sidebar */}
        {showSidebar && (
          <div className="w-52 shrink-0 flex flex-col overflow-hidden relative">
            <Sidebar
              tables={tables}
              engine={engine}
              remoteConnection={remoteConnection}
              onBrowse={handleBrowseTable}
              onDrop={handleDropTable}
              onRefresh={refreshTables}
            />
            <button
              onClick={toggleSidebar}
              className="absolute top-2 right-2 p-0.5 hover:bg-[var(--ide-surface3)] rounded text-[var(--ide-text-4)] hover:text-[var(--ide-text-2)]"
            >
              <ChevronLeft size={12} />
            </button>
          </div>
        )}

        {/* Center panel */}
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Editor */}
          <div className="overflow-hidden min-h-0" style={{ flex: '1 1 50%' }}>
            <Editor
              value={sql}
              onChange={setSql}
              onRun={() => runRef.current()}
              isDark={theme === 'dark'}
            />
          </div>

          {/* Divider */}
          <div className="h-px bg-[var(--ide-border)] shrink-0" />

          {/* Results panel */}
          <div className="flex flex-col overflow-hidden" style={{ flex: '1 1 50%' }}>
            {/* Results tabs */}
            <div className="flex items-center gap-1 px-3 py-1.5 border-b border-[var(--ide-border)] shrink-0" style={{ background: 'var(--ide-surface)' }}>
              <button
                onClick={() => setActiveResultTab('table')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs ${
                  activeResultTab === 'table' ? 'bg-[var(--ide-surface2)] text-[var(--ide-text)]' : 'text-[var(--ide-text-3)] hover:text-[var(--ide-text-2)]'
                }`}
              >
                <TableIcon size={11} /> Table
              </button>
              <button
                onClick={() => setActiveResultTab('chart')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs ${
                  activeResultTab === 'chart' ? 'bg-[var(--ide-surface2)] text-[var(--ide-text)]' : 'text-[var(--ide-text-3)] hover:text-[var(--ide-text-2)]'
                }`}
              >
                <BarChart2 size={11} /> Chart
              </button>
              {activeResultTab === 'chart' && (
                <div className="flex items-center gap-1 ml-2">
                  {(['none', 'bar', 'line', 'pie', 'bubble'] as ChartType[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => setChartType(t)}
                      className={`px-2 py-0.5 rounded text-xs capitalize ${
                        chartType === t ? 'bg-blue-600 text-white' : 'text-[var(--ide-text-3)] hover:text-[var(--ide-text-2)]'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex-1 overflow-hidden">
              {isLoading ? (
                <div className="flex items-center justify-center h-full text-[var(--ide-text-3)] text-sm gap-2">
                  <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  Executing query...
                </div>
              ) : result ? (
                activeResultTab === 'table' ? (
                  <ResultsTable result={result} />
                ) : (
                  <ChartView result={result} chartType={chartType} isDark={theme === 'dark'} />
                )
              ) : (
                <div className="flex items-center justify-center h-full text-[var(--ide-text-4)] text-sm">
                  Run a query to see results (Ctrl+Enter / ⌘+Enter)
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Panel (History + Favorites) */}
        {showHistory && (
          <div className="w-72 shrink-0 border-l border-[var(--ide-border)] overflow-hidden flex flex-col">
            {/* Tabs */}
            <div className="flex border-b border-[var(--ide-border)] shrink-0">
              <button
                onClick={() => setRightPanelTab('history')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium border-b-2 transition-colors ${
                  rightPanelTab === 'history'
                    ? 'border-blue-500 text-blue-300'
                    : 'border-transparent text-[var(--ide-text-3)] hover:text-[var(--ide-text-2)]'
                }`}
              >
                <Clock size={11} /> History
              </button>
              <button
                onClick={() => setRightPanelTab('favorites')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium border-b-2 transition-colors ${
                  rightPanelTab === 'favorites'
                    ? 'border-yellow-500 text-yellow-300'
                    : 'border-transparent text-[var(--ide-text-3)] hover:text-[var(--ide-text-2)]'
                }`}
              >
                <Star size={11} /> Favorites
                {favoriteQueries.length > 0 && (
                  <span className="bg-yellow-600/40 text-yellow-300 text-xs px-1.5 rounded-full">{favoriteQueries.length}</span>
                )}
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              {rightPanelTab === 'history' ? (
                <QueryHistory
                  history={history}
                  onSelect={(q) => setSql(q)}
                  onClear={clearHistory}
                />
              ) : (
                <FavoritesPanel
                  favorites={favoriteQueries}
                  onSelect={(q) => setSql(q)}
                  onDelete={removeFavoriteQuery}
                />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Status bar */}
      <footer className="flex items-center gap-3 px-3 py-1 border-t border-[var(--ide-border)] text-xs text-[var(--ide-text-3)] shrink-0" style={{ background: 'var(--ide-surface)' }}>
        <div className={`w-2 h-2 rounded-full ${ENGINE_LABELS[engine].color}`} />
        <span>{ENGINE_LABELS[engine].label}</span>
        {ENGINE_LABELS[engine].wasm && <span className="text-[var(--ide-text-4)]">· In-browser (WebAssembly)</span>}
        {remoteConnection && !ENGINE_LABELS[engine].wasm && (
          <span className="text-[var(--ide-text-4)]">· {remoteConnection.host}:{remoteConnection.port}/{remoteConnection.database}</span>
        )}
        {result && !result.error && (
          <span className="ml-auto">{result.rowCount} rows · {result.executionTime.toFixed(2)}ms</span>
        )}
      </footer>

      {/* Connection Modal */}
      {showConnectionModal && (
        <ConnectionModal
          engine={engine}
          currentConnection={remoteConnection}
          onConnect={(conn: RemoteConnection) => {
            setRemoteConnection(conn)
            setShowConnectionModal(false)
            getRemoteTables(engine, conn).then(setTables)
          }}
          onClose={() => setShowConnectionModal(false)}
          savedConnections={savedConnections}
          onSaveConnection={(c: SavedConnection) => addSavedConnection(c)}
          onDeleteConnection={removeSavedConnection}
        />
      )}
    </div>
  )
}
