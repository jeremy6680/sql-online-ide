// src/App.tsx
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Play,
  Upload,
  Download,
  Clock,
  ChevronLeft,
  ChevronRight,
  Database,
  BarChart2,
  TableIcon,
  Star,
  Sun,
  Moon,
  Network,
  LogIn,
  LogOut,
  Sparkles,
  Keyboard,
  Link,
  Check,
  WandSparkles,
  X,
  Plus,
  ChevronDown,
  BookOpen,
  Settings,
} from "lucide-react";
import { Editor, type EditorHandle } from "./components/Editor";
import { ResultsTable } from "./components/ResultsTable";
import { ChartView } from "./components/ChartView";
import { Sidebar } from "./components/Sidebar";
import { QueryHistory } from "./components/QueryHistory";
import { FavoritesPanel } from "./components/FavoritesPanel";
import { ConnectionModal } from "./components/ConnectionModal";
import { SchemaView } from "./components/SchemaView";
import { LoginModal } from "./components/LoginPage";
import { AIHelpPanel } from "./components/AIHelpPanel";
import { CertPanel } from "./components/CertPanel";
import { ShortcutsModal } from "./components/ShortcutsModal";

import { useStore } from "./store";
import {
  initSQLite,
  runSQLiteQuery,
  getSQLiteTables,
  getSQLiteColumns,
  loadSQLiteFile,
} from "./engines/sqlite";
import { initDuckDB, runDuckDBQuery, getDuckDBTables, getDuckDBColumns, registerDuckDBFile } from "./engines/duckdb";
import { runRemoteQuery, getRemoteTables, getRemoteColumns } from "./engines/remote";
import type {
  DbEngine,
  ChartType,
  RemoteConnection,
  SavedConnection,
  HistoryEntry,
  FavoriteQuery,
} from "./types";
import * as XLSX from "xlsx";

const ENGINE_LABELS: Record<
  DbEngine,
  { label: string; color: string; wasm: boolean }
> = {
  sqlite: { label: "SQLite", color: "bg-blue-600", wasm: true },
  duckdb: { label: "DuckDB", color: "bg-yellow-600", wasm: true },
  mysql: { label: "MySQL", color: "bg-orange-600", wasm: false },
  mariadb: { label: "MariaDB", color: "bg-teal-600", wasm: false },
  postgresql: { label: "PostgreSQL", color: "bg-indigo-600", wasm: false },
};

export default function App() {
  const {
    auth,
    setAuth,
    logout,
    engine,
    setEngine,
    sql,
    setSql,
    result,
    setResult,
    isLoading,
    setIsLoading,
    tables,
    setTables,
    history,
    setHistory,
    addHistory,
    clearHistory,
    remoteConnection,
    setRemoteConnection,
    chartType,
    setChartType,
    showHistory,
    toggleHistory,
    showSidebar,
    toggleSidebar,
    favoriteQueries,
    setFavoriteQueries,
    addFavoriteQuery,
    removeFavoriteQuery,
    savedConnections,
    setSavedConnections,
    addSavedConnection,
    removeSavedConnection,
    theme,
    toggleTheme,
    tabs,
    activeTabId,
    addTab,
    closeTab,
    setActiveTab,
    updateTabSql,
    updateTabEngine,
    certPanelOpen,
    setCertPanelOpen,
  } = useStore();

  const activeTab = tabs.find(t => t.id === activeTabId) ?? tabs[0];

  const [activeResultTab, setActiveResultTab] = useState<
    "table" | "chart" | "schema"
  >("table");
  const [showConnectionModal, setShowConnectionModal] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [rightPanelTab, setRightPanelTab] = useState<"history" | "favorites">(
    "history",
  );
  const [showFavNameInput, setShowFavNameInput] = useState(false);
  const [favName, setFavName] = useState("");
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [aiEnabled, setAIEnabled] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [certPanelWidth, setCertPanelWidth] = useState(384);
  const [schemaMap, setSchemaMap] = useState<Record<string, string[]>>({});
  const [shareCopied, setShareCopied] = useState(false);
  const [showImportMenu, setShowImportMenu] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [editorHeightPct, setEditorHeightPct] = useState(50);
  const centerPanelRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const duckdbImportRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<EditorHandle>(null);
  const runRef = useRef<() => void>(() => {});
  // Track whether we have already loaded server data for the current session
  const serverDataLoadedRef = useRef(false);

  // ── Server-side history/favorites sync ──────────────────────────────────────

  const loadServerUserData = useCallback(
    (token: string) => {
      if (serverDataLoadedRef.current) return;
      serverDataLoadedRef.current = true;
      fetch("/api/user/data", {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => res.json())
        .then((data: { history?: HistoryEntry[]; favoriteQueries?: FavoriteQuery[]; savedConnections?: SavedConnection[] }) => {
          if (Array.isArray(data.history)) setHistory(data.history);
          if (Array.isArray(data.favoriteQueries)) setFavoriteQueries(data.favoriteQueries);
          if (Array.isArray(data.savedConnections)) setSavedConnections(data.savedConnections);
        })
        .catch(() => {});
    },
    [setHistory, setFavoriteQueries, setSavedConnections],
  );

  const saveServerUserData = useCallback(
    (token: string) => {
      fetch("/api/user/data", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ history, favoriteQueries, savedConnections }),
      }).catch(() => {});
    },
    [history, favoriteQueries, savedConnections],
  );

  // Load server data whenever the user logs in (token goes from null → value)
  useEffect(() => {
    if (auth.token) {
      serverDataLoadedRef.current = false; // reset so loadServerUserData proceeds
      loadServerUserData(auth.token);
    } else {
      serverDataLoadedRef.current = false;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.token]);

  // Auto-save to server whenever history or favorites change (debounced)
  useEffect(() => {
    if (!auth.token) return;
    const id = setTimeout(() => saveServerUserData(auth.token!), 800);
    return () => clearTimeout(id);
  }, [auth.token, history, favoriteQueries, savedConnections, saveServerUserData]);

  // On load: verify stored token is still valid; detect if auth is enabled; check AI status
  useEffect(() => {
    // Check AI availability
    fetch("/api/ai/status")
      .then((res) => res.json())
      .then((data: { aiEnabled: boolean }) => setAIEnabled(data.aiEnabled))
      .catch(() => {});

    // Check if auth is enabled on the server
    fetch("/api/auth/status")
      .then((res) => res.json())
      .then((data: { authEnabled: boolean }) => {
        if (!data.authEnabled) {
          // Auth disabled — clear any stale token
          setAuth({ token: null, username: null, authEnabled: false });
          return;
        }
        // Auth enabled — validate stored token if present
        if (auth.token) {
          fetch("/api/auth/me", {
            headers: { Authorization: `Bearer ${auth.token}` },
          }).then((res) => {
            if (res.status === 401) {
              logout();
            } else {
              // Token is valid — load persisted user data from server
              loadServerUserData(auth.token!);
            }
          });
        } else {
          setAuth({ ...auth, authEnabled: true });
        }
      })
      .catch(() => {
        // Server unreachable — keep current state
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync store sql/engine → active tab when tab switches
  useEffect(() => {
    if (!activeTab) return
    setSql(activeTab.sql)
    // Only switch engine if it differs (avoids re-init on every render)
    if (activeTab.engine !== engine) handleEngineChange(activeTab.engine)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabId])

  // Build schema map for CodeMirror autocompletion whenever the table list changes
  useEffect(() => {
    if (!tables.length) { setSchemaMap({}); return }
    const load = async () => {
      const entries = await Promise.all(
        tables.map(async (t) => {
          let cols: string[] = []
          try {
            if (engine === 'sqlite') cols = getSQLiteColumns(t.name).map(c => c.name)
            else if (engine === 'duckdb') cols = (await getDuckDBColumns(t.name)).map(c => c.name)
            else if (remoteConnection) cols = (await getRemoteColumns(engine, remoteConnection, t.name)).map(c => c.name)
          } catch { /* best-effort */ }
          return [t.name, cols] as [string, string[]]
        })
      )
      setSchemaMap(Object.fromEntries(entries))
    }
    load()
  }, [tables, engine, remoteConnection])

  // Read URL hash on first render and restore SQL + engine from it
  useEffect(() => {
    const hash = window.location.hash.slice(1)
    if (!hash) return
    try {
      const { sql: hashSql, engine: hashEngine } = JSON.parse(atob(decodeURIComponent(hash)))
      if (typeof hashSql === 'string') setSql(hashSql)
      if (typeof hashEngine === 'string') handleEngineChange(hashEngine as DbEngine)
    } catch { /* malformed hash — ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep URL hash in sync with current SQL + engine (replaceState — no browser history entry)
  useEffect(() => {
    const encoded = encodeURIComponent(btoa(JSON.stringify({ sql, engine })))
    window.history.replaceState(null, '', `#${encoded}`)
  }, [sql, engine])

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setShareCopied(true)
      setTimeout(() => setShareCopied(false), 2000)
    })
  }

  // Open shortcuts modal on `?` (ignore when focus is in an input/textarea)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === '?') setShowShortcuts(true)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Initialize default engine on first render
  useEffect(() => {
    if (initialized) return;
    setInitialized(true);
    initSQLite().then(() => {
      setTables(getSQLiteTables());
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshTables = useCallback(async () => {
    if (engine === "sqlite") {
      setTables(getSQLiteTables());
    } else if (engine === "duckdb") {
      setTables(await getDuckDBTables());
    } else if (remoteConnection) {
      setTables(await getRemoteTables(engine, remoteConnection));
    }
  }, [engine, remoteConnection, setTables]);

  const handleRun = useCallback(async () => {
    if (!sql.trim()) return;
    setIsLoading(true);
    setResult(null);

    let res;
    if (engine === "sqlite") {
      res = await runSQLiteQuery(sql);
    } else if (engine === "duckdb") {
      await initDuckDB();
      res = await runDuckDBQuery(sql);
    } else if (remoteConnection) {
      res = await runRemoteQuery({ engine, sql, connection: remoteConnection });
    } else {
      setShowConnectionModal(true);
      setIsLoading(false);
      return;
    }

    setResult(res);
    setIsLoading(false);

    addHistory({
      id: crypto.randomUUID(),
      query: sql,
      engine,
      timestamp: Date.now(),
      success: !res.error,
      rowCount: res.rowCount,
    });

    await refreshTables();
  }, [
    sql,
    engine,
    remoteConnection,
    setIsLoading,
    setResult,
    addHistory,
    refreshTables,
  ]);

  runRef.current = handleRun;

  const handleEngineChange = async (e: DbEngine) => {
    setEngine(e);
    updateTabEngine(activeTabId, e);
    setResult(null);
    setTables([]);
    if (e === "sqlite") {
      await initSQLite();
      setTables(getSQLiteTables());
    } else if (e === "duckdb") {
      await initDuckDB();
      setTables(await getDuckDBTables());
    } else {
      setShowConnectionModal(true);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase();

    if (ext === "db" || ext === "sqlite" || ext === "sqlite3") {
      const buf = await file.arrayBuffer();
      await loadSQLiteFile(buf);
      setEngine("sqlite");
      setTables(getSQLiteTables());
    } else if (ext === "sql") {
      const text = await file.text();
      setSql(text);
    }
    e.target.value = "";
  };

  const handleDuckDBImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    await initDuckDB();
    const snippet = await registerDuckDBFile(file);
    setSql(snippet);
    setEngine("duckdb");
    setTables(await getDuckDBTables());
  };

  const handleExportXLSX = () => {
    if (!result || result.error || !result.columns.length) return;
    const ws = XLSX.utils.aoa_to_sheet([
      result.columns,
      ...result.rows.map((r) => r.map(String)),
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Results");
    XLSX.writeFile(wb, `query_results_${Date.now()}.xlsx`);
  };

  const handleExportCSV = () => {
    if (!result || result.error || !result.columns.length) return;
    const escape = (v: unknown) => {
      const s = v === null ? '' : String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    };
    const csv = [result.columns, ...result.rows]
      .map((row) => (row as unknown[]).map(escape).join(','))
      .join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `query_results_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // MySQL/MariaDB use backticks for identifiers; all others use double quotes
  const quoteIdent = useCallback(
    (name: string) =>
      engine === "mysql" || engine === "mariadb" ? `\`${name}\`` : `"${name}"`,
    [engine],
  );

  const handleBrowseTable = useCallback(
    async (tableName: string) => {
      const browseSQL = `SELECT * FROM ${quoteIdent(tableName)} LIMIT 200`;
      setIsLoading(true);
      setResult(null);
      let res;
      if (engine === "sqlite") res = await runSQLiteQuery(browseSQL);
      else if (engine === "duckdb") {
        await initDuckDB();
        res = await runDuckDBQuery(browseSQL);
      } else if (remoteConnection)
        res = await runRemoteQuery({
          engine,
          sql: browseSQL,
          connection: remoteConnection,
        });
      if (res) setResult(res);
      setIsLoading(false);
    },
    [engine, remoteConnection, quoteIdent, setIsLoading, setResult],
  );

  const handleDropTable = useCallback(
    async (tableName: string) => {
      const dropSQL = `DROP TABLE ${quoteIdent(tableName)}`;
      if (engine === "sqlite") await runSQLiteQuery(dropSQL);
      else if (engine === "duckdb") {
        await initDuckDB();
        await runDuckDBQuery(dropSQL);
      } else if (remoteConnection)
        await runRemoteQuery({
          engine,
          sql: dropSQL,
          connection: remoteConnection,
        });
      await refreshTables();
    },
    [engine, remoteConnection, quoteIdent, refreshTables],
  );

  const handleSaveFavorite = () => {
    if (!favName.trim()) return;
    addFavoriteQuery({
      id: crypto.randomUUID(),
      name: favName.trim(),
      query: sql,
      engine,
      createdAt: Date.now(),
    });
    setFavName("");
    setShowFavNameInput(false);
    setRightPanelTab("favorites");
    if (!showHistory) toggleHistory();
  };

  return (
    <div
      className={`flex flex-col h-screen select-none ${theme === "dark" ? "dark" : ""}`}
      style={{ background: "var(--ide-bg)", color: "var(--ide-text)" }}
    >
      {/* ── Top Toolbar ────────────────────────────────────────────── */}
      {/*
        Accessibility notes:
        - <header> landmark is announced by screen readers as "banner"
        - Engine selector wrapped in role="group" + aria-label so its
          purpose is communicated before individual buttons are read
        - Every icon-only button has an explicit aria-label
        - aria-pressed reflects toggleable button states
        - aria-disabled mirrors the disabled prop for AT compatibility
      */}
      <header
        role="banner"
        className="flex items-center gap-2 px-3 py-2 border-b border-[var(--ide-border)] shrink-0"
        style={{ background: "var(--ide-surface)" }}
      >
        {/* Logo — presentational, not interactive */}
        <div className="flex items-center gap-2 mr-3" aria-hidden="true">
          <Database size={18} className="text-blue-400" />
          <span className="font-bold text-sm text-[var(--ide-text)]">
            SQL IDE
          </span>
        </div>

        {/* Engine Selector */}
        <div
          role="group"
          aria-label="Database engine"
          className="flex items-center gap-1 rounded-lg p-0.5 border border-[var(--ide-border)]"
          style={{ background: "var(--ide-bg)" }}
        >
          {(Object.keys(ENGINE_LABELS) as DbEngine[]).map((e) => (
            <button
              key={e}
              onClick={() => handleEngineChange(e)}
              aria-pressed={engine === e}
              aria-label={`Switch to ${ENGINE_LABELS[e].label}${ENGINE_LABELS[e].wasm ? " (runs in browser)" : ""}`}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                engine === e
                  ? `${ENGINE_LABELS[e].color} text-white shadow`
                  : "text-[var(--ide-text-2)] hover:text-[var(--ide-text)] hover:bg-[var(--ide-surface2)]"
              }`}
            >
              {ENGINE_LABELS[e].label}
              {ENGINE_LABELS[e].wasm && (
                <span className="ml-1 text-[9px] opacity-60" aria-hidden="true">
                  WASM
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* Run button */}
        <button
          onClick={handleRun}
          disabled={isLoading}
          aria-label="Run query (Ctrl+Enter)"
          aria-disabled={isLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-500 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors text-white"
        >
          <Play size={13} fill="currentColor" aria-hidden="true" />
          Run
          <span className="text-xs opacity-60 ml-0.5" aria-hidden="true">⌘↵</span>
        </button>

        {/* Import dropdown */}
        <div className="relative">
          <button
            onClick={() => { setShowImportMenu(v => !v); setShowExportMenu(false) }}
            aria-label="Import file"
            aria-haspopup="true"
            aria-expanded={showImportMenu}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--ide-surface2)] hover:bg-[var(--ide-surface3)] border border-[var(--ide-border)] rounded-lg text-sm transition-colors"
          >
            <Upload size={13} aria-hidden="true" />
            Import
            <ChevronDown size={11} aria-hidden="true" />
          </button>
          {showImportMenu && (
            <div
              className="absolute left-0 top-full mt-1 z-50 w-52 bg-[var(--ide-surface)] border border-[var(--ide-border)] rounded-lg shadow-xl py-1 text-sm"
              onMouseLeave={() => setShowImportMenu(false)}
            >
              <button
                onClick={() => { setShowImportMenu(false); fileInputRef.current?.click() }}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[var(--ide-surface2)] text-left"
              >
                <Upload size={12} aria-hidden="true" />
                <div>
                  <div className="text-[var(--ide-text)]">SQLite / SQL file</div>
                  <div className="text-[var(--ide-text-4)] text-xs">.db .sqlite .sqlite3 .sql</div>
                </div>
              </button>
              <button
                onClick={() => { setShowImportMenu(false); duckdbImportRef.current?.click() }}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[var(--ide-surface2)] text-left"
              >
                <Upload size={12} aria-hidden="true" />
                <div>
                  <div className="text-[var(--ide-text)]">Data file → DuckDB</div>
                  <div className="text-[var(--ide-text-4)] text-xs">.csv .tsv .json .parquet</div>
                </div>
              </button>
            </div>
          )}
        </div>
        <input ref={fileInputRef} type="file" accept=".db,.sqlite,.sqlite3,.sql" className="hidden" aria-hidden="true" tabIndex={-1} onChange={handleImport} />
        <input ref={duckdbImportRef} type="file" accept=".csv,.tsv,.json,.ndjson,.parquet" className="hidden" aria-hidden="true" tabIndex={-1} onChange={handleDuckDBImport} />

        {/* Format button */}
        <button
          onClick={() => editorRef.current?.formatSQL()}
          aria-label="Format SQL"
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--ide-surface2)] hover:bg-[var(--ide-surface3)] border border-[var(--ide-border)] rounded-lg text-sm transition-colors"
        >
          <WandSparkles size={13} aria-hidden="true" />
          Format
        </button>

        {/* Share button */}
        <button
          onClick={handleShare}
          aria-label="Copy shareable link"
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--ide-surface2)] hover:bg-[var(--ide-surface3)] border border-[var(--ide-border)] rounded-lg text-sm transition-colors"
        >
          {shareCopied ? <Check size={13} className="text-green-400" aria-hidden="true" /> : <Link size={13} aria-hidden="true" />}
          {shareCopied ? 'Copied!' : 'Share'}
        </button>

        {/* Export dropdown */}
        <div className="relative">
          <button
            onClick={() => { setShowExportMenu(v => !v); setShowImportMenu(false) }}
            disabled={!result || !!result.error || !result.columns.length}
            aria-label="Export query results"
            aria-haspopup="true"
            aria-expanded={showExportMenu}
            aria-disabled={!result || !!result.error || !result.columns.length}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--ide-surface2)] hover:bg-[var(--ide-surface3)] border border-[var(--ide-border)] rounded-lg text-sm transition-colors disabled:opacity-40"
          >
            <Download size={13} aria-hidden="true" />
            Export
            <ChevronDown size={11} aria-hidden="true" />
          </button>
          {showExportMenu && (
            <div
              className="absolute right-0 top-full mt-1 z-50 w-40 bg-[var(--ide-surface)] border border-[var(--ide-border)] rounded-lg shadow-xl py-1 text-sm"
              onMouseLeave={() => setShowExportMenu(false)}
            >
              <button
                onClick={() => { setShowExportMenu(false); handleExportXLSX() }}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[var(--ide-surface2)] text-left text-[var(--ide-text)]"
              >
                <Download size={12} aria-hidden="true" />
                Excel (.xlsx)
              </button>
              <button
                onClick={() => { setShowExportMenu(false); handleExportCSV() }}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[var(--ide-surface2)] text-left text-[var(--ide-text)]"
              >
                <Download size={12} aria-hidden="true" />
                CSV (.csv)
              </button>
            </div>
          )}
        </div>

        {/* Save as favorite — inline name-input flow */}
        {showFavNameInput ? (
          <div
            className="flex items-center gap-1"
            role="group"
            aria-label="Save query as favorite"
          >
            <label htmlFor="fav-name-input" className="sr-only">
              Favorite name
            </label>
            <input
              id="fav-name-input"
              autoFocus
              className="bg-[var(--ide-surface)] border border-yellow-500/60 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-yellow-400 w-44 text-[var(--ide-text)]"
              placeholder="Favorite name…"
              value={favName}
              onChange={(e) => setFavName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveFavorite();
                if (e.key === "Escape") setShowFavNameInput(false);
              }}
            />
            <button
              onClick={handleSaveFavorite}
              disabled={!favName.trim()}
              aria-label="Confirm save favorite"
              aria-disabled={!favName.trim()}
              className="px-2 py-1.5 bg-yellow-600 hover:bg-yellow-500 rounded-lg text-sm disabled:opacity-40"
            >
              <Star size={13} fill="currentColor" aria-hidden="true" />
            </button>
            <button
              onClick={() => setShowFavNameInput(false)}
              aria-label="Cancel saving favorite"
              className="text-[var(--ide-text-3)] hover:text-[var(--ide-text)] px-1"
            >
              {/* Using × character so it degrades gracefully without JS */}
              <span aria-hidden="true">✕</span>
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowFavNameInput(true)}
            aria-label="Save current query as favorite"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--ide-surface2)] hover:bg-[var(--ide-surface3)] border border-[var(--ide-border)] rounded-lg text-sm transition-colors text-yellow-400 hover:text-yellow-300"
          >
            <Star size={13} aria-hidden="true" />
          </button>
        )}

        {/* History toggle */}
        <button
          onClick={toggleHistory}
          aria-label={showHistory ? "Hide history panel" : "Show history panel"}
          aria-pressed={showHistory}
          aria-expanded={showHistory}
          aria-controls="right-panel"
          className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-sm transition-colors ${
            showHistory
              ? "bg-blue-600/20 border-blue-500 text-blue-300"
              : "bg-[var(--ide-surface2)] border-[var(--ide-border)] hover:bg-[var(--ide-surface3)]"
          }`}
        >
          <Clock size={13} aria-hidden="true" />
          History
        </button>

        {/* AI Help toggle — only shown when AI is enabled AND user is logged in */}
        {aiEnabled && auth.token && (
          <button
            onClick={() => setShowAIPanel((v) => !v)}
            aria-label={showAIPanel ? "Hide AI assistant" : "Show AI assistant"}
            aria-pressed={showAIPanel}
            className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-sm transition-colors ${
              showAIPanel
                ? "bg-purple-600/20 border-purple-500 text-purple-300"
                : "bg-[var(--ide-surface2)] border-[var(--ide-border)] hover:bg-[var(--ide-surface3)] text-purple-400 hover:text-purple-300"
            }`}
          >
            <Sparkles size={13} aria-hidden="true" />
            AI Help
          </button>
        )}

        {/* Test SQL prep — only shown when AI is enabled AND user is logged in */}
        {aiEnabled && auth.token && (
          <button
            onClick={() => setCertPanelOpen(!certPanelOpen)}
            aria-label={certPanelOpen ? "Fermer la préparation Test SQL" : "Ouvrir la préparation Test SQL"}
            aria-pressed={certPanelOpen}
            className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-sm transition-colors ${
              certPanelOpen
                ? "dark:bg-emerald-600/20 bg-emerald-100 dark:border-emerald-500 border-emerald-500 dark:text-emerald-300 text-emerald-700"
                : "bg-[var(--ide-surface2)] border-[var(--ide-border)] hover:bg-[var(--ide-surface3)] dark:text-emerald-400 text-emerald-600 dark:hover:text-emerald-300 hover:text-emerald-700"
            }`}
          >
            <BookOpen size={13} aria-hidden="true" />
            Test
          </button>
        )}

        {/* Settings dropdown — groups keyboard shortcuts, theme toggle, and auth */}
        <div className="relative">
          <button
            onClick={() => setShowSettingsMenu((v) => !v)}
            aria-label="Settings"
            aria-haspopup="true"
            aria-expanded={showSettingsMenu}
            className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-sm transition-colors ${
              showSettingsMenu
                ? "bg-[var(--ide-surface3)] border-[var(--ide-border)]"
                : "bg-[var(--ide-surface2)] border-[var(--ide-border)] hover:bg-[var(--ide-surface3)]"
            }`}
          >
            <Settings size={13} aria-hidden="true" />
            {auth.token && (
              <span className="text-xs text-[var(--ide-text-2)] max-w-[80px] truncate">
                {auth.username}
              </span>
            )}
          </button>
          {showSettingsMenu && (
            <div
              className="absolute right-0 top-full mt-1 z-50 w-52 bg-[var(--ide-surface)] border border-[var(--ide-border)] rounded-lg shadow-xl py-1 text-sm"
              onMouseLeave={() => setShowSettingsMenu(false)}
            >
              <button
                onClick={() => { setShowSettingsMenu(false); setShowShortcuts(true); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-[var(--ide-surface2)] text-left text-[var(--ide-text)]"
              >
                <Keyboard size={13} aria-hidden="true" />
                Raccourcis clavier
              </button>
              <button
                onClick={toggleTheme}
                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-[var(--ide-surface2)] text-left text-[var(--ide-text)]"
              >
                {theme === "dark" ? (
                  <Sun size={13} aria-hidden="true" />
                ) : (
                  <Moon size={13} aria-hidden="true" />
                )}
                {theme === "dark" ? "Mode clair" : "Mode sombre"}
              </button>
              <div className="border-t border-[var(--ide-border)] my-1" />
              {auth.token ? (
                <button
                  onClick={() => { setShowSettingsMenu(false); logout(); }}
                  title={`Connecté en tant que ${auth.username}`}
                  className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-[var(--ide-surface2)] text-left text-red-500 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300"
                >
                  <LogOut size={13} aria-hidden="true" />
                  Se déconnecter
                </button>
              ) : (
                <button
                  onClick={() => { setShowSettingsMenu(false); setShowLoginModal(true); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-[var(--ide-surface2)] text-left text-[var(--ide-text)]"
                >
                  <LogIn size={13} aria-hidden="true" />
                  Se connecter
                </button>
              )}
            </div>
          )}
        </div>
      </header>

      {/* ── Main Content ───────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Sidebar expand button — only shown when sidebar is hidden */}
        {!showSidebar && (
          <button
            onClick={toggleSidebar}
            aria-label="Show table explorer"
            aria-expanded={false}
            aria-controls="sidebar-panel"
            className="absolute left-0 top-1/2 z-10 -translate-y-1/2 bg-[var(--ide-surface2)] border border-[var(--ide-border)] p-0.5 rounded-r"
          >
            <ChevronRight size={12} aria-hidden="true" />
          </button>
        )}

        {/* Sidebar */}
        {showSidebar && (
          <div
            id="sidebar-panel"
            role="complementary"
            aria-label="Table explorer"
            className="w-52 shrink-0 flex flex-col overflow-hidden relative"
          >
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
              aria-label="Hide table explorer"
              aria-expanded={true}
              aria-controls="sidebar-panel"
              className="absolute top-2 right-2 p-0.5 hover:bg-[var(--ide-surface3)] rounded text-[var(--ide-text-4)] hover:text-[var(--ide-text-2)]"
            >
              <ChevronLeft size={12} aria-hidden="true" />
            </button>
          </div>
        )}

        {/* Center panel — editor + results */}
        <div ref={centerPanelRef} className="flex flex-col flex-1 overflow-hidden">
          {/* Tab bar */}
          <div className="flex items-center border-b border-[var(--ide-border)] shrink-0 overflow-x-auto" style={{ background: 'var(--ide-surface)' }}>
            {tabs.map((tab) => (
              <div
                key={tab.id}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs border-r border-[var(--ide-border)] cursor-pointer shrink-0 group ${
                  tab.id === activeTabId
                    ? 'bg-[var(--ide-bg)] text-[var(--ide-text)]'
                    : 'text-[var(--ide-text-3)] hover:text-[var(--ide-text-2)] hover:bg-[var(--ide-surface2)]'
                }`}
                onClick={() => setActiveTab(tab.id)}
              >
                <span className="max-w-[120px] truncate">{tab.name}</span>
                {tabs.length > 1 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); closeTab(tab.id) }}
                    aria-label={`Close ${tab.name}`}
                    className="opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity ml-0.5"
                  >
                    <X size={10} />
                  </button>
                )}
              </div>
            ))}
            <button
              onClick={() => { addTab(); }}
              aria-label="New query tab"
              className="px-2.5 py-1.5 text-[var(--ide-text-3)] hover:text-[var(--ide-text)] hover:bg-[var(--ide-surface2)] shrink-0"
            >
              <Plus size={13} />
            </button>
          </div>

          {/* Editor region */}
          <div
            role="region"
            aria-label="SQL editor"
            className="overflow-hidden min-h-0"
            style={{ height: `${editorHeightPct}%` }}
          >
            <Editor
              ref={editorRef}
              value={sql}
              onChange={(val) => { setSql(val); updateTabSql(activeTabId, val) }}
              onRun={() => runRef.current()}
              isDark={theme === "dark"}
              schema={schemaMap}
              dialect={engine === 'mysql' || engine === 'mariadb' || engine === 'postgresql' || engine === 'sqlite' ? engine : 'sqlite'}
            />
          </div>

          {/* Drag handle */}
          <div
            role="separator"
            aria-label="Resize editor and results"
            aria-orientation="horizontal"
            className="h-1.5 bg-[var(--ide-border)] shrink-0 cursor-row-resize hover:bg-blue-500/40 transition-colors active:bg-blue-500/60"
            onMouseDown={(e) => {
              e.preventDefault()
              const panel = centerPanelRef.current
              if (!panel) return
              const onMove = (ev: MouseEvent) => {
                const { top, height } = panel.getBoundingClientRect()
                const pct = Math.min(80, Math.max(20, ((ev.clientY - top) / height) * 100))
                setEditorHeightPct(pct)
              }
              const onUp = () => {
                document.removeEventListener('mousemove', onMove)
                document.removeEventListener('mouseup', onUp)
              }
              document.addEventListener('mousemove', onMove)
              document.addEventListener('mouseup', onUp)
            }}
          />

          {/* Results panel */}
          <div
            role="region"
            aria-label="Query results"
            className="flex flex-col overflow-hidden"
            style={{ height: `${100 - editorHeightPct}%` }}
          >
            {/* Results view tabs */}
            <div
              role="tablist"
              aria-label="Result view"
              className="flex items-center gap-1 px-3 py-1.5 border-b border-[var(--ide-border)] shrink-0"
              style={{ background: "var(--ide-surface)" }}
            >
              <button
                role="tab"
                aria-selected={activeResultTab === "table"}
                aria-controls="results-tab-panel"
                onClick={() => setActiveResultTab("table")}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs ${
                  activeResultTab === "table"
                    ? "bg-[var(--ide-surface2)] text-[var(--ide-text)]"
                    : "text-[var(--ide-text-3)] hover:text-[var(--ide-text-2)]"
                }`}
              >
                <TableIcon size={11} aria-hidden="true" /> Table
              </button>
              <button
                role="tab"
                aria-selected={activeResultTab === "chart"}
                aria-controls="results-tab-panel"
                onClick={() => setActiveResultTab("chart")}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs ${
                  activeResultTab === "chart"
                    ? "bg-[var(--ide-surface2)] text-[var(--ide-text)]"
                    : "text-[var(--ide-text-3)] hover:text-[var(--ide-text-2)]"
                }`}
              >
                <BarChart2 size={11} aria-hidden="true" /> Chart
              </button>
              <button
                onClick={() => setActiveResultTab("schema")}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs ${
                  activeResultTab === "schema"
                    ? "bg-[var(--ide-surface2)] text-[var(--ide-text)]"
                    : "text-[var(--ide-text-3)] hover:text-[var(--ide-text-2)]"
                }`}
                aria-pressed={activeResultTab === "schema"}
              >
                <Network size={11} /> Schema
              </button>
              {/* Chart type selector — only visible in chart tab */}
              {activeResultTab === "chart" && (
                <div
                  role="group"
                  aria-label="Chart type"
                  className="flex items-center gap-1 ml-2"
                >
                  {(
                    ["none", "bar", "line", "pie", "bubble"] as ChartType[]
                  ).map((t) => (
                    <button
                      key={t}
                      onClick={() => setChartType(t)}
                      aria-pressed={chartType === t}
                      aria-label={`Chart type: ${t}`}
                      className={`px-2 py-0.5 rounded text-xs capitalize ${
                        chartType === t
                          ? "bg-blue-600 text-white"
                          : "text-[var(--ide-text-3)] hover:text-[var(--ide-text-2)]"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Results content */}
            <div
              id="results-tab-panel"
              role="tabpanel"
              aria-label={
                activeResultTab === "table" ? "Results table" : "Results chart"
              }
              className="flex-1 overflow-hidden"
            >
              {isLoading ? (
                <div
                  role="status"
                  aria-live="polite"
                  className="flex items-center justify-center h-full text-[var(--ide-text-3)] text-sm gap-2"
                >
                  {/* Spinner is decorative; the text carries the meaning */}
                  <div
                    className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"
                    aria-hidden="true"
                  />
                  Executing query…
                </div>
              ) : result ? (
                activeResultTab === "table" ? (
                  <ResultsTable result={result} />
                ) : activeResultTab === "chart" ? (
                  <ChartView
                    result={result}
                    chartType={chartType}
                    isDark={theme === "dark"}
                  />
                ) : (
                  // Schema tab is always accessible, even without a query result
                  <SchemaView
                    engine={engine}
                    remoteConnection={remoteConnection}
                    tables={tables}
                    isDark={theme === "dark"}
                  />
                )
              ) : activeResultTab === "schema" ? (
                // Allow opening Schema even before running a query
                <SchemaView
                  engine={engine}
                  remoteConnection={remoteConnection}
                  tables={tables}
                  isDark={theme === "dark"}
                />
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
          <div
            id="right-panel"
            role="complementary"
            aria-label="History and favorites"
            className="w-72 shrink-0 border-l border-[var(--ide-border)] overflow-hidden flex flex-col"
          >
            {/* Panel tabs */}
            <div
              role="tablist"
              aria-label="Panel"
              className="flex border-b border-[var(--ide-border)] shrink-0"
            >
              <button
                role="tab"
                aria-selected={rightPanelTab === "history"}
                aria-controls="right-panel-content"
                onClick={() => setRightPanelTab("history")}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium border-b-2 transition-colors ${
                  rightPanelTab === "history"
                    ? "border-blue-500 text-blue-300"
                    : "border-transparent text-[var(--ide-text-3)] hover:text-[var(--ide-text-2)]"
                }`}
              >
                <Clock size={11} aria-hidden="true" /> History
              </button>
              <button
                role="tab"
                aria-selected={rightPanelTab === "favorites"}
                aria-controls="right-panel-content"
                onClick={() => setRightPanelTab("favorites")}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium border-b-2 transition-colors ${
                  rightPanelTab === "favorites"
                    ? "border-yellow-500 text-yellow-300"
                    : "border-transparent text-[var(--ide-text-3)] hover:text-[var(--ide-text-2)]"
                }`}
              >
                <Star size={11} aria-hidden="true" /> Favorites
                {favoriteQueries.length > 0 && (
                  <span
                    className="bg-yellow-600/40 text-yellow-300 text-xs px-1.5 rounded-full"
                    aria-label={`${favoriteQueries.length} saved favorites`}
                  >
                    {favoriteQueries.length}
                  </span>
                )}
              </button>
            </div>

            {/* Panel content */}
            <div
              id="right-panel-content"
              role="tabpanel"
              aria-label={
                rightPanelTab === "history"
                  ? "Query history"
                  : "Favorite queries"
              }
              className="flex-1 overflow-hidden"
            >
              {rightPanelTab === "history" ? (
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

        {/* AI Help Panel */}
        {showAIPanel && aiEnabled && (
          <div
            role="complementary"
            aria-label="AI SQL assistant"
            className="w-80 shrink-0 border-l border-[var(--ide-border)] overflow-hidden flex flex-col"
          >
            <AIHelpPanel
              engine={engine}
              tables={tables}
              remoteConnection={remoteConnection}
              token={auth.token}
              onUseQuery={(sql) => {
                setSql(sql);
                setShowAIPanel(false);
              }}
            />
          </div>
        )}

        {/* Test SQL Prep Panel */}
        {certPanelOpen && aiEnabled && (
          <>
            {/* Horizontal resize handle — drag left to widen, right to narrow */}
            <div
              role="separator"
              aria-label="Redimensionner le panneau Test SQL"
              aria-orientation="vertical"
              className="w-1.5 shrink-0 cursor-col-resize bg-[var(--ide-border)] hover:bg-blue-500/40 transition-colors active:bg-blue-500/60"
              onMouseDown={(e) => {
                e.preventDefault();
                const startX = e.clientX;
                const startWidth = certPanelWidth;
                const onMove = (ev: MouseEvent) => {
                  const newWidth = Math.min(
                    700,
                    Math.max(280, startWidth + (startX - ev.clientX)),
                  );
                  setCertPanelWidth(newWidth);
                };
                const onUp = () => {
                  document.removeEventListener("mousemove", onMove);
                  document.removeEventListener("mouseup", onUp);
                };
                document.addEventListener("mousemove", onMove);
                document.addEventListener("mouseup", onUp);
              }}
            />
            <div
              role="complementary"
              aria-label="Préparation Test SQL"
              className="shrink-0 overflow-hidden flex flex-col"
              style={{ width: certPanelWidth }}
            >
              <CertPanel
                token={auth.token}
                onClose={() => setCertPanelOpen(false)}
              />
            </div>
          </>
        )}
      </div>

      {/* ── Status Bar ─────────────────────────────────────────────── */}
      <footer
        role="contentinfo"
        aria-label="Connection status"
        className="flex items-center gap-3 px-3 py-1 border-t border-[var(--ide-border)] text-xs text-[var(--ide-text-3)] shrink-0"
        style={{ background: "var(--ide-surface)" }}
      >
        {/* Engine indicator dot — decorative */}
        <div
          className={`w-2 h-2 rounded-full ${ENGINE_LABELS[engine].color}`}
          aria-hidden="true"
        />
        <span>{ENGINE_LABELS[engine].label}</span>
        {ENGINE_LABELS[engine].wasm && (
          <span className="text-[var(--ide-text-4)]">
            · In-browser (WebAssembly)
          </span>
        )}
        {remoteConnection && !ENGINE_LABELS[engine].wasm && (
          <span className="text-[var(--ide-text-4)]">
            · {remoteConnection.host}:{remoteConnection.port}/
            {remoteConnection.database}
          </span>
        )}
        {result && !result.error && (
          <span className="ml-auto" aria-live="polite">
            {result.rowCount} rows · {result.executionTime.toFixed(2)}ms
          </span>
        )}
      </footer>

      {/* Connection Modal */}
      {showConnectionModal && (
        <ConnectionModal
          engine={engine}
          currentConnection={remoteConnection}
          onConnect={(conn: RemoteConnection) => {
            setRemoteConnection(conn);
            setShowConnectionModal(false);
            getRemoteTables(engine, conn).then(setTables);
          }}
          onClose={() => setShowConnectionModal(false)}
          savedConnections={savedConnections}
          onSaveConnection={(c: SavedConnection) => addSavedConnection(c)}
          onDeleteConnection={removeSavedConnection}
        />
      )}

      {/* Login Modal */}
      {showLoginModal && (
        <LoginModal onClose={() => setShowLoginModal(false)} />
      )}

      {/* Shortcuts Modal */}
      {showShortcuts && (
        <ShortcutsModal onClose={() => setShowShortcuts(false)} />
      )}
    </div>
  );
}
