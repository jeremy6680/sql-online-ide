# STRUCTURE.md — SQL Online IDE

## Overview

```
sql-online-ide/
├── src/                        # Frontend (React + TypeScript)
│   ├── components/             # UI components
│   │   ├── Editor.tsx          # CodeMirror 6 SQL editor wrapper (schema-aware autocomplete)
│   │   ├── ResultsTable.tsx    # Paginated results table (copy cell/row, type badges)
│   │   ├── ChartView.tsx       # Chart.js visualisation panel
│   │   ├── Sidebar.tsx         # Table explorer with column drill-down
│   │   ├── QueryHistory.tsx    # Scrollable history of past queries
│   │   ├── FavoritesPanel.tsx  # Saved/named queries panel
│   │   ├── ConnectionModal.tsx # Remote DB connection form + saved connections
│   │   ├── LoginPage.tsx       # Login modal (JWT-based auth)
│   │   ├── SchemaView.tsx      # ERD-style schema diagram (SVG)
│   │   ├── ShortcutsModal.tsx  # Keyboard shortcuts reference modal (open with `?`)
│   │   └── AIHelpPanel.tsx     # AI SQL assistant panel (natural language → SQL)
│   ├── engines/                # Database engine wrappers
│   │   ├── sqlite.ts           # sql.js (WASM) — init, query, tables, columns, file load
│   │   ├── duckdb.ts           # duckdb-wasm — init, query, tables, columns
│   │   └── remote.ts           # HTTP client for the Express proxy (query, tables, columns, test)
│   ├── store.ts                # Zustand global state (persisted to localStorage)
│   ├── types.ts                # Shared TypeScript types / interfaces
│   ├── App.tsx                 # Root component — layout, toolbar, all wiring
│   ├── index.css               # CSS variables (theme tokens), global resets, scrollbar styles
│   └── main.tsx                # React entry point
│
├── server/                     # Backend (Express proxy)
│   ├── index.ts                # Express app — unified /api/* endpoints, static serving
│   ├── auth.ts                 # JWT auth middleware, credential validation, token signing
│   ├── userData.ts             # File-based per-user store (history + favorites → data/users/)
│   ├── mysql.ts                # MySQL/MariaDB connector (mysql2) + router
│   └── postgres.ts             # PostgreSQL connector (pg) + router
│
├── data/                       # Runtime-generated, gitignored
│   └── users/                  # Per-user JSON files: <username>.json (history + favorites)
│
├── public/
│   └── sql-wasm.wasm           # Pre-built sql.js WASM binary (SQLite engine)
│
├── CONTEXT.md                  # Project overview, goals, stack, constraints
├── STRUCTURE.md                # This file — folder/file structure explained
├── DECISIONS.md                # Architectural and technical decisions log
├── NEXT_STEPS.md               # Backlog / what to build next
├── README.md                   # Setup, features, deployment instructions
├── Dockerfile                  # Multi-stage build (Vite frontend + Express backend)
├── docker-compose.yml          # (if present) Local dev with Docker Compose
├── package.json                # Root package (frontend + backend share node_modules)
├── tsconfig.json               # TypeScript config (frontend)
├── tsconfig.server.json        # TypeScript config (server)
├── vite.config.ts              # Vite config (proxy /api → :3001 in dev)
└── tailwind.config.js          # TailwindCSS config
```

## Key Files in Detail

### `src/App.tsx`
The root component and main orchestrator. Responsibilities:
- Toolbar layout (engine selector, run button, import/export dropdowns, format, share, history toggle, theme toggle)
- Engine initialisation and switching (`handleEngineChange`)
- Query execution routing (`handleRun`) — dispatches to the right engine wrapper
- Table browsing and dropping
- Import (`.db`, `.sqlite`, `.sqlite3`, `.sql` via dropdown; `.csv`, `.tsv`, `.json`, `.parquet` → DuckDB)
- Export (`.xlsx`, `.csv` via dropdown)
- Right panel (history/favorites) and sidebar toggle state
- Schema map computation for CodeMirror autocompletion (`schemaMap` state, wired into `<Editor>`)
- Resizable editor/results split via drag handle (`editorHeightPct` state)
- Multi-tab editor: tab bar above editor, syncs `sql`/`engine` with active `QueryTab` in store
- URL hash sync: SQL + engine encoded on change, restored on first load (`Share` button copies the URL)

### `src/store.ts`
Zustand store, persisted to `localStorage`. Contains:
- Active engine, current SQL, query result, loading state
- Tables list, selected table
- Query history (last 100 entries) — also synced to server when logged in
- Favorite queries (named, engine-tagged) — also synced to server when logged in
- Remote connection (active session — **password included, not ideal for long-term storage**)
- Saved connections (name + engine + RemoteConnection shape)
- Panel visibility (sidebar, history panel)
- Theme (`dark` | `light`)
- Auth state (JWT token, username, authEnabled flag)

### `src/types.ts`
All shared types. The canonical source of truth for:
- `DbEngine` — union type for the five supported engines
- `QueryResult` — columns, rows, rowCount, executionTime, error, statementIndex?, statementTotal?
- `TableInfo`, `ColumnInfo` — schema metadata
- `HistoryEntry`, `FavoriteQuery`, `SavedConnection`, `RemoteConnection`
- `ChartType`
- `QueryTab` — id, name, sql, engine (for multi-tab editor)

### `src/engines/`
Each file is a thin wrapper that exposes a consistent async API:
- `init*()` — lazy initialisation (safe to call multiple times)
- `run*Query(sql)` — executes SQL, returns `QueryResult`
- `get*Tables()` — returns `TableInfo[]`
- `get*Columns(tableName)` — returns `ColumnInfo[]`
- `registerDuckDBFile(file)` — registers a local CSV/JSON/Parquet file into DuckDB's VFS and returns a ready-to-run `CREATE TABLE AS SELECT *` snippet

### `server/index.ts`
Unified Express API surface:
| Endpoint | Method | Auth required | Description |
|---|---|---|---|
| `/api/auth/status` | GET | No | Whether auth is enabled |
| `/api/auth/login` | POST | No | Login — returns JWT |
| `/api/auth/me` | GET | Yes | Validate stored token |
| `/api/user/data` | GET | Yes | Load user's history + favorites from server |
| `/api/user/data` | POST | Yes | Save user's history + favorites to server |
| `/api/ai/sql` | POST | Yes | Translate natural-language prompt to SQL (requires `ANTHROPIC_API_KEY`) |
| `/api/ai/status` | GET | No | Whether AI assistant is configured |
| `/api/query` | POST | No | Run SQL on MySQL/MariaDB/PostgreSQL |
| `/api/tables` | POST | No | List tables for a connection |
| `/api/columns` | POST | No | List columns for a table |
| `/api/test-connection` | POST | No | Ping the DB without running a query |

In production, Express also serves the Vite-built frontend as static files.

### `src/index.css`
Defines all CSS custom properties (design tokens):
```
Light theme (:root)          Dark theme (.dark)
--ide-bg                     Tokyo Night background
--ide-surface                Surface / panel backgrounds
--ide-surface2               Hover / active states
--ide-surface3               Deeper hover
--ide-border                 All border colours
--ide-text                   Primary text
--ide-text-2                 Secondary text
--ide-text-3                 Muted text
--ide-text-4                 Very muted / placeholder
--ide-accent                 Blue accent (#3b82f6 / #7aa2f7)
```
**Never hardcode colours** — always use these variables.
