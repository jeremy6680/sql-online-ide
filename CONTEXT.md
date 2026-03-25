# CONTEXT.md — SQL Online IDE

## What Is This?

A fully browser-based SQL IDE supporting multiple database engines, with no installation or sign-up required. Users can write and run SQL queries directly in the browser against SQLite and DuckDB (both run as WebAssembly), or connect to remote MySQL, MariaDB, and PostgreSQL instances via a lightweight Express proxy.

Inspired by [SQLiteOnline](https://sqliteonline.com/), but fully open source and free of the limitations of its free tier.

## Goals

- **Zero-friction SQL playground** — open the URL, start writing SQL immediately (SQLite loaded by default)
- **Multi-engine support** — one UI for five database engines
- **Portfolio project** — part of the "Web2Data" personal brand, showcasing both frontend and data engineering skills
- **DataBird bootcamp companion** — useful as a hands-on tool during the analytics engineering curriculum (SQL, dbt, DuckDB, medallion architecture)
- **Open-source alternative** — usable by other developers as a self-hosted tool

## Tech Stack

### Frontend
| Technology | Role |
|---|---|
| React 18 | UI framework |
| TypeScript | Type safety |
| Vite | Dev server + bundler |
| TailwindCSS | Styling |
| CodeMirror 6 | SQL editor (syntax highlighting, autocompletion) |
| Zustand | Global state (persisted to localStorage) |
| Chart.js + react-chartjs-2 | Result visualisation |
| xlsx | Export to Excel |
| Lucide React | Icons |

### In-Browser SQL Engines (WASM)
| Engine | Library |
|---|---|
| SQLite | [sql.js](https://sql-js.github.io/sql.js/) |
| DuckDB | [duckdb-wasm](https://github.com/duckdb/duckdb-wasm) |

### Backend (Express proxy)
| Technology | Role |
|---|---|
| Node.js + Express | HTTP server (port 3001) |
| mysql2 | MySQL / MariaDB connector |
| pg | PostgreSQL connector |

### Deployment
| Technology | Role |
|---|---|
| Docker (multi-stage) | Containerisation |
| Coolify | PaaS on Hetzner VPS (auto-deploy, SSL) |

## Key Constraints

- **SQLite and DuckDB run entirely client-side** — no server roundtrip, no data leaves the browser
- **Express is only a proxy** — it forwards credentials and SQL to the target DB; it never stores them
- **No authentication layer** — not safe to expose publicly without adding one (HTTP Basic Auth, etc.)
- **HTTPS required in production** — WASM and `crypto.randomUUID()` require a Secure Context
- **DuckDB needs COOP/COEP headers** — Express sets these automatically in production for `SharedArrayBuffer` support
- **State in localStorage** — Zustand `persist` middleware; be deliberate about what gets stored (never raw passwords in history, etc.)

## Audience

- Developer / data analyst who wants a quick SQL scratchpad
- Analytics engineering student using DuckDB and SQL daily
- Developer self-hosting an alternative to SQLiteOnline
