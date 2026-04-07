# SQL Online IDE

A browser-based SQL IDE supporting SQLite, DuckDB, MySQL, MariaDB, and PostgreSQL — no install required.
Inspired by SQLiteOnline, but fully open source and without the limitations of the free tier.

🌐 **Live at [sql.web2data.org](https://sql.web2data.org)**

## Features

- ✍️ **SQL Editor** — CodeMirror 6 with syntax highlighting, schema-aware autocompletion, and `Ctrl+Enter` / `Cmd+Enter` to run
- 🗄️ **Multiple engines** — SQLite, DuckDB, MySQL, MariaDB, PostgreSQL
- 🖥️ **In-browser execution** — SQLite and DuckDB run entirely via WebAssembly (no server needed)
- 🗂️ **Multi-tab editor** — open and switch between multiple query buffers, each with its own engine
- 🔎 **Table explorer** — browse tables and columns in the sidebar; click a table to preview its data
- 🗑️ **Drop tables** — delete a table directly from the UI without writing SQL
- 🕘 **Query history** — last 100 queries; synced to the server when logged in (survives cache clears and private browsing)
- ⭐ **Favorites** — save and name queries for quick reuse; synced to the server when logged in
- 🔌 **Saved connections** — store MySQL/MariaDB/PostgreSQL connection configs; synced per-user when logged in
- 🤖 **AI SQL assistant** — describe what you want in plain language, get a ready-to-run SQL query (Anthropic Claude or OpenAI GPT — requires a user-configured API key)
- 🎓 **ENI SQL Certification Prep** — AI-generated practice questions in the style of the ENI SQL exam (QCU, QCM, and practical cases with auto-correction); requires an Anthropic API key
- 📊 **Charts** — visualize results as bar, line, pie, or bubble charts
- ✨ **Format SQL** — reformat the editor content with a single click, dialect-aware
- 🔗 **Share query** — copy a shareable URL encoding the current SQL and engine
- 📥 **Import** — load `.db`, `.sqlite`, `.sqlite3`, `.sql` files, or drop `.csv`, `.json`, `.parquet` directly into DuckDB
- 📤 **Export** — download query results as `.xlsx` or `.csv`
- 🌓 **Light / dark theme** — Tokyo Night dark theme + clean light mode
- 🌐 **Multilingual** — English and French interface (auto-detected from browser language)
- 🔐 **User accounts** — self-registration, login by email or username, forgot password with email reset link
- 🔑 **Per-user API keys** — each user stores their own Anthropic/OpenAI key, encrypted at rest (AES-256-GCM)

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
NODE_ENV=production npm start
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
│   ├── auth.ts           # JWT auth, registration, password reset, rate limiting
│   ├── apiKeys.ts        # AES-256-GCM encryption for user API keys
│   ├── mailer.ts         # SMTP email sender (password reset)
│   ├── cert.ts           # ENI SQL certification question generator (Claude API)
│   ├── mysql.ts          # MySQL / MariaDB routes
│   └── postgres.ts       # PostgreSQL routes
└── public/
    └── sql-wasm.wasm     # Bundled sql.js WASM binary
```

### Engine details

| Engine          | Runs in        | Notes                                                                        |
| --------------- | -------------- | ---------------------------------------------------------------------------- |
| SQLite          | Browser (WASM) | [sql.js](https://sql-js.github.io/sql.js/) — full SQLite in WebAssembly      |
| DuckDB          | Browser (WASM) | [duckdb-wasm](https://github.com/duckdb/duckdb-wasm) — analytical SQL engine |
| MySQL / MariaDB | Remote         | Proxied via Express + [mysql2](https://github.com/sidorares/node-mysql2)     |
| PostgreSQL      | Remote         | Proxied via Express + [pg](https://github.com/brianc/node-postgres)          |

## Tech Stack

- **Frontend** — React 18, TypeScript, Vite, TailwindCSS
- **Editor** — CodeMirror 6
- **Charts** — Chart.js + react-chartjs-2
- **State** — Zustand (with localStorage persistence + optional server sync)
- **i18n** — i18next + react-i18next (EN + FR)
- **SQL formatting** — sql-formatter
- **Export** — xlsx
- **Backend** — Express, mysql2, pg
- **Auth** — JWT (jsonwebtoken + bcryptjs), express-rate-limit
- **Email** — nodemailer (SMTP)
- **AI** — Anthropic SDK + OpenAI SDK (per-user keys, AES-256-GCM encrypted)

## Deployment

The app is deployed via **Coolify** on a **Hetzner VPS** and served at [sql.web2data.org](https://sql.web2data.org).

### Docker

A `Dockerfile` is included. The multi-stage build compiles the frontend and packages it with the Express backend into a single container.

```bash
docker build -t sql-online-ide .
docker run -p 3001:3001 -e NODE_ENV=production sql-online-ide
```

### Recommended stack: Hetzner VPS + Coolify

**Server specs (minimum):**

| Resource | Minimum       | Recommended  |
| -------- | ------------- | ------------ |
| vCPU     | 1             | 2            |
| RAM      | 512 MB        | 2 GB         |
| Disk     | 10 GB         | 20 GB        |
| OS       | Ubuntu 22.04+ | Ubuntu 24.04 |

> SQLite and DuckDB run entirely in the browser (WebAssembly) — the server only handles MySQL/MariaDB/PostgreSQL proxy requests. Resource usage is therefore very low.

**Steps:**

1. Create a Hetzner CX22 VPS (Ubuntu 24.04, ~€4.51/month)
2. Install Coolify:
   ```bash
   curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
   ```
3. Open Coolify at `http://<your-ip>:8000`
4. **New Resource → Application → GitHub** → select this repo
5. Build pack: **Dockerfile** (auto-detected)
6. Port: **3001**
7. Environment variable: `NODE_ENV=production`
8. Deploy

Coolify handles SSL (Let's Encrypt) and zero-downtime redeploys on each push to `main`.

### Environment variables

| Variable             | Default       | Description |
| -------------------- | ------------- | ----------- |
| `NODE_ENV`           | `development` | Set to `production` to serve the built frontend and enable security headers |
| `PORT`               | `3001`        | Port the Express server listens on |
| `AUTH_USERS`         | _(unset)_     | Static users at deploy time: `admin:pass` or JSON `[{"username":"…","password":"…"}]` |
| `JWT_SECRET`         | _(fallback)_  | Secret used to sign JWT tokens — **set a strong random value in production** |
| `ALLOW_REGISTRATION` | `false`       | Set to `true` to allow users to self-register via the UI |
| `ENCRYPTION_KEY`     | _(unset)_     | 32-byte hex key for AES-256-GCM encryption of stored API keys — **required in production** |
| `SMTP_HOST`          | _(unset)_     | SMTP server hostname (e.g. `smtp.gmail.com`) — enables password reset emails |
| `SMTP_PORT`          | `587`         | SMTP port |
| `SMTP_USER`          | _(unset)_     | SMTP login |
| `SMTP_PASS`          | _(unset)_     | SMTP password (for Gmail: use an App Password) |
| `SMTP_FROM`          | _(SMTP_USER)_ | Sender address in reset emails |
| `APP_URL`            | `http://localhost:3001` | Base URL used to build reset links in emails |

> If `SMTP_*` is not configured, password reset links are printed to the server console instead — useful for local/self-hosted setups.

**Generate secure values:**
```bash
# JWT_SECRET and ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Technical requirements

**HTTPS is mandatory in production.**
Both WebAssembly engines (SQLite, DuckDB) and the `crypto.randomUUID()` API require a [Secure Context](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts) — i.e., HTTPS or localhost. The app will not work correctly over plain HTTP.

**COOP/COEP headers for DuckDB.**
DuckDB WASM uses `SharedArrayBuffer` for multi-threaded execution. This requires two HTTP headers that the Express server sets automatically in production:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Without these, DuckDB falls back to a slower single-threaded mode.

**Database connectivity for MySQL/MariaDB/PostgreSQL.**
The remote database engines are proxied through the Express backend. The database server must therefore be reachable from the machine running this app — not from the user's browser.

**Security note for public deployments.**
The backend is an open database proxy — it will forward any credentials and SQL provided by the user to any host reachable from the server. This is safe for personal/team use but **should not be exposed publicly without enabling authentication** (`ALLOW_REGISTRATION=true` or `AUTH_USERS`).

## Contributing

Pull requests are welcome. For major changes, please open an issue first.

## License

[MIT](LICENSE) — © 2026 Jeremy Marchandeau
