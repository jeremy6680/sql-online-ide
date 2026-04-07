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
│   │   ├── LoginPage.tsx       # Auth modal (sign in / sign up / forgot password / reset password)
│   │   ├── ApiKeySettings.tsx  # Per-user API key management (Anthropic + OpenAI, AES-256-GCM encrypted)
│   │   ├── SchemaView.tsx      # ERD-style schema diagram (SVG)
│   │   ├── ShortcutsModal.tsx  # Keyboard shortcuts reference modal (open with `?`)
│   │   ├── AIHelpPanel.tsx     # AI SQL assistant panel (natural language → SQL, provider + model selector)
│   │   └── CertPanel.tsx       # ENI SQL certification prep panel (question generation + auto-correction)
│   ├── engines/                # Database engine wrappers
│   │   ├── sqlite.ts           # sql.js (WASM) — init, query, tables, columns, file load, isolated execution (cert)
│   │   ├── duckdb.ts           # duckdb-wasm — init, query, tables, columns
│   │   └── remote.ts           # HTTP client for the Express proxy (query, tables, columns, test)
│   ├── store.ts                # Zustand global state (persisted to localStorage)
│   ├── types.ts                # Shared TypeScript types / interfaces
│   ├── App.tsx                 # Root component — layout, toolbar, all wiring
│   ├── i18n.ts                 # i18next config (EN + FR, browser language detection)
│   ├── index.css               # CSS variables (theme tokens), global resets, scrollbar styles
│   └── main.tsx                # React entry point
│
├── server/                     # Backend (Express proxy)
│   ├── index.ts                # Express app — unified /api/* endpoints, static serving
│   ├── auth.ts                 # JWT auth, bcrypt, self-registration, password reset tokens, rate limiting
│   ├── userData.ts             # File-based per-user store (history + favorites + encrypted API keys)
│   ├── apiKeys.ts              # AES-256-GCM encryption/decryption for user API keys
│   ├── mailer.ts               # nodemailer SMTP wrapper — sends password reset emails
│   ├── cert.ts                 # ENI SQL cert question generator — Claude prompt + JSON parsing
│   ├── mysql.ts                # MySQL/MariaDB connector (mysql2) + router
│   └── postgres.ts             # PostgreSQL connector (pg) + router
│
├── data/                       # Runtime-generated, gitignored
│   ├── auth/
│   │   └── users.json          # Self-registered user accounts (username, email, bcrypt hash)
│   └── users/                  # Per-user JSON files: <username>.json (history + favorites + encrypted keys)
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
- Toolbar layout (engine dropdown, run button, import/export dropdowns, format, share, history toggle, theme toggle)
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
- Settings dropdown (keyboard shortcuts, theme toggle, API Keys, auth)
- ENI Cert panel toggle + horizontal resize handle (`certPanelWidth` state, 280–700 px)
- Detects `?reset_token=xxx` in URL on load and auto-opens the reset-password modal

### `src/store.ts`
Zustand store, persisted to `localStorage`. Contains:
- Active engine, current SQL, query result, loading state
- Tables list, selected table
- Query history (last 100 entries) — also synced to server when logged in
- Favorite queries (named, engine-tagged) — also synced to server when logged in
- Remote connection (active session — **password included, not ideal for long-term storage**)
- Saved connections (name + engine + RemoteConnection shape)
- Panel visibility (sidebar, history panel, `certPanelOpen`)
- Theme (`dark` | `light`)
- Language (`en` | `fr`)
- Auth state (JWT token, username, authEnabled flag)
- AI preferences: `aiProvider` (`anthropic` | `openai`), `aiModel` (string), `aiKeyPresence` (booleans — never the raw keys)
- On `logout()`: clears history, favoriteQueries, savedConnections, and aiKeyPresence to prevent data leaking to the next session

### `src/types.ts`
All shared types. The canonical source of truth for:
- `DbEngine` — union type for the five supported engines
- `QueryResult` — columns, rows, rowCount, executionTime, error, statementIndex?, statementTotal?
- `TableInfo`, `ColumnInfo` — schema metadata
- `HistoryEntry`, `FavoriteQuery`, `SavedConnection`, `RemoteConnection`
- `ChartType`
- `QueryTab` — id, name, sql, engine (for multi-tab editor)
- `CertQuestion` and variants (`CertQuestionQCU`, `CertQuestionQCM`, `CertQuestionPractical`) — ENI cert prep types

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
| `/api/auth/status` | GET | No | Whether auth + registration are enabled |
| `/api/auth/login` | POST | No | Login with username or email — returns JWT |
| `/api/auth/register` | POST | No | Create a new account (requires `ALLOW_REGISTRATION=true`) |
| `/api/auth/forgot-password` | POST | No | Request a password reset email |
| `/api/auth/reset-password` | POST | No | Apply a password reset using a valid token |
| `/api/auth/me` | GET | Yes | Validate stored token |
| `/api/user/data` | GET | Yes | Load user's history + favorites + connections from server |
| `/api/user/data` | POST | Yes | Save user's history + favorites + connections to server |
| `/api/user/api-keys` | GET | Yes | Get which AI providers have a key stored (booleans only) |
| `/api/user/api-keys` | POST | Yes | Store an encrypted API key for a provider |
| `/api/user/api-keys/:provider` | DELETE | Yes | Remove a stored API key |
| `/api/ai/sql` | POST | Yes | Translate natural-language prompt to SQL (Anthropic or OpenAI) |
| `/api/ai/status` | GET | Yes | Whether the user has at least one AI key configured |
| `/api/cert/question` | POST | Yes | Generate an ENI SQL exam question via Claude |
| `/api/cert/exam` | POST | Yes | Generate a full 20-question mock exam via Claude |
| `/api/query` | POST | No | Run SQL on MySQL/MariaDB/PostgreSQL |
| `/api/tables` | POST | No | List tables for a connection |
| `/api/columns` | POST | No | List columns for a table |
| `/api/foreign-keys` | POST | No | List FK relationships |
| `/api/test-connection` | POST | No | Ping the DB without running a query |

In production, Express also serves the Vite-built frontend as static files.

### `server/apiKeys.ts`
Handles AES-256-GCM encryption and decryption of user API keys. The encryption key is derived via `scryptSync` from `ENCRYPTION_KEY` env var (or `JWT_SECRET` as fallback). Stored format: base64 of `[12-byte IV][16-byte authTag][ciphertext]`. Raw keys are never written to disk or returned to the browser.

### `server/mailer.ts`
nodemailer SMTP wrapper for sending password reset emails. Configured via `SMTP_HOST/PORT/USER/PASS/FROM` env vars. If SMTP is not configured, the reset link is printed to the server console instead (useful for self-hosted / local setups).

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
