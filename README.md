# SQL Online IDE

A browser-based SQL IDE supporting multiple database engines — no installation or sign-up required.

Inspired by SQLiteOnline, but fully open source and without the limitations of the free tier.

## Features

- **SQL Editor** — CodeMirror 6 with syntax highlighting, autocompletion, and `Ctrl+Enter` / `Cmd+Enter` to run
- **Multiple engines** — SQLite, DuckDB, MySQL, MariaDB, PostgreSQL
- **In-browser execution** — SQLite and DuckDB run entirely via WebAssembly (no server needed)
- **Table explorer** — browse tables and columns in the sidebar; click a table to preview its data
- **Drop tables** — delete a table directly from the UI without writing SQL
- **Query history** — last 100 queries saved locally, click to restore
- **Favorites** — save and name queries for quick reuse
- **Saved connections** — store MySQL/MariaDB/PostgreSQL connection configs locally
- **Charts** — visualize results as bar, line, pie, or bubble charts
- **Import** — load `.db`, `.sqlite`, `.sqlite3`, or `.sql` files
- **Export** — download query results as `.xlsx`
- **Light / dark theme** — Tokyo Night dark theme + clean light mode

## Getting Started

### Prerequisites

- Node.js 18+
- (Optional) A running MySQL/MariaDB or PostgreSQL instance for remote engines

### Install & run

```bash
git clone https://github.com/jeremy6680/sql-online-ide.git
cd sql-online-ide
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

The frontend (Vite) and the backend proxy (Express) start together via `concurrently`.

### Build for production

```bash
npm run build
npm run preview
```

## Architecture

```
sql-online-ide/
├── src/
│   ├── components/       # React UI components
│   ├── engines/
│   │   ├── sqlite.ts     # sql.js (WebAssembly) wrapper
│   │   ├── duckdb.ts     # duckdb-wasm wrapper
│   │   └── remote.ts     # HTTP client for the Express proxy
│   ├── store.ts          # Zustand state (persisted to localStorage)
│   └── App.tsx
├── server/
│   ├── index.ts          # Express server (port 3001)
│   ├── mysql.ts          # MySQL / MariaDB routes
│   └── postgres.ts       # PostgreSQL routes
└── public/
    └── sql-wasm.wasm     # Bundled sql.js WASM binary
```

### Engine details

| Engine | Runs in | Notes |
|--------|---------|-------|
| SQLite | Browser (WASM) | [sql.js](https://sql-js.github.io/sql.js/) — full SQLite in WebAssembly |
| DuckDB | Browser (WASM) | [duckdb-wasm](https://github.com/duckdb/duckdb-wasm) — analytical SQL engine |
| MySQL / MariaDB | Remote | Proxied via Express + [mysql2](https://github.com/sidorares/node-mysql2) |
| PostgreSQL | Remote | Proxied via Express + [pg](https://github.com/brianc/node-postgres) |

## Tech Stack

- **Frontend** — React 18, TypeScript, Vite, TailwindCSS
- **Editor** — CodeMirror 6
- **Charts** — Chart.js + react-chartjs-2
- **State** — Zustand (with localStorage persistence)
- **Export** — xlsx
- **Backend** — Express, mysql2, pg

## Contributing

Pull requests are welcome. For major changes, please open an issue first.

## License

[MIT](LICENSE)
