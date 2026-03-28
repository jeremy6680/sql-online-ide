# DECISIONS.md — SQL Online IDE

Architectural and technical decisions, with rationale and trade-offs.
Most recent entries first.

---

## [2025] WASM engines run entirely in the browser (no server for SQLite/DuckDB)

**Decision:** SQLite (sql.js) and DuckDB (duckdb-wasm) run as WebAssembly in the browser. No server roundtrip for these engines.

**Rationale:**
- Zero data leakage — user data never leaves the browser
- No server costs for the most common use cases
- Instant feedback, no network latency
- Aligns with the "no install, no sign-up" product promise

**Trade-off:**
- First load is heavier (WASM binaries are several MB)
- DuckDB requires `SharedArrayBuffer`, which needs COOP/COEP headers — added complexity in production
- WASM memory is bounded by the browser tab; very large datasets may cause issues

---

## [2025] Express as a thin proxy for remote engines (no query logic server-side)

**Decision:** The Express backend is purely a proxy. It forwards credentials and SQL from the browser to MySQL/MariaDB/PostgreSQL and returns raw results. No query parsing, caching, or transformation on the server.

**Rationale:**
- Simple and auditable — the server does almost nothing
- Engine-specific logic stays in the database driver
- Easy to extend with a new engine (add a route file, register it in `index.ts`)

**Trade-off:**
- The server is an open proxy — it must **not** be exposed publicly without adding an auth layer
- Credentials are transmitted in every request body (HTTPS is mandatory)
- No query sanitisation server-side — SQL injection risk is the caller's responsibility

---

## [2025] Zustand with `persist` for global state

**Decision:** Zustand is used for all global state, persisted to `localStorage` via the `persist` middleware.

**Rationale:**
- Lightweight compared to Redux
- No boilerplate — actions and state co-located
- Persistence gives users a seamless experience on reload (SQL, history, favorites, connections survive a page refresh)

**Trade-off:**
- All persisted state is in a single localStorage key — can grow large with long query history
- The active `remoteConnection` (including password) is stored in localStorage. This is a known trade-off: it improves UX (connection survives reload) but means passwords persist in plaintext in the browser. Future hardening: store only host/user/db, prompt for password on reconnect.
- Care required when adding new state: mark non-serialisable or ephemeral state as excluded from persistence

---

## [2025] CodeMirror 6 as the SQL editor

**Decision:** CodeMirror 6 is used over alternatives (Monaco, Ace, plain textarea).

**Rationale:**
- Modern, modular architecture — only load what you need
- First-class SQL support (`@codemirror/lang-sql`)
- Lightweight compared to Monaco
- Good accessibility baseline
- Active maintenance

**Trade-off:**
- More verbose setup than Monaco for features like multi-cursor or advanced autocomplete
- SQL autocomplete is schema-unaware by default (does not yet use the live table/column list from the sidebar)

**Known improvement:** Wire the tables/columns from the Zustand store into CodeMirror's `sql()` schema config for context-aware autocompletion.

---

## [2025] Single `package.json` for frontend and backend

**Decision:** Frontend (Vite) and backend (Express) share a single `package.json` at the project root.

**Rationale:**
- Simpler monorepo for a project of this size
- `concurrently` runs both dev servers with one `npm run dev`
- Single Docker build context

**Trade-off:**
- All dependencies (frontend + backend) installed together — slightly heavier `node_modules`
- Not ideal for scaling to multiple packages; would need a proper monorepo tool (Turborepo, nx) if the project grows significantly

---

## [2025] Docker multi-stage build — Vite frontend bundled into Express

**Decision:** In production, Express serves the Vite-built frontend as static files. A multi-stage Dockerfile handles this.

**Rationale:**
- Single container, single port (3001) — simpler deployment
- No need for a separate Nginx or CDN for a personal/team-scale project
- Coolify handles SSL termination upstream

**Trade-off:**
- Frontend and backend are coupled in the container — a frontend change requires a full rebuild and redeploy
- Not ideal for high-traffic scenarios (a CDN + dedicated static hosting would be better)

---

## [2025] Theme system via CSS custom properties

**Decision:** All colours are defined as CSS custom properties (`--ide-*`) in `index.css`, toggled by adding/removing the `.dark` class on the root element.

**Rationale:**
- Clean separation between tokens and components
- Easy to add new themes without changing component code
- Works with both Tailwind utilities and inline styles

**Trade-off:**
- Tailwind's JIT compiler can't tree-shake custom property values — all utility classes must be listed explicitly or kept in `safelist`
- Requires discipline: hardcoded colour values in components break the theme system

---

## [2025] Optional JWT authentication layer

**Decision:** The app supports an optional login system. Set `AUTH_USERS` in `.env` to enable it; leave it unset for unrestricted access.

**Rationale:**
- Target audience is personal / small-team use, self-hosted — auth should be opt-in, not mandatory
- JWT (7-day expiry, signed with `JWT_SECRET`) keeps the implementation stateless
- Passwords are hashed with bcrypt at server startup — never stored in plaintext
- Enabling auth unlocks server-side features (history/favorites sync, AI assistant)

**Trade-off:**
- Token is stored in `localStorage` — not HttpOnly. Acceptable for the current threat model (self-hosted, trusted users), but XSS would expose it
- No token revocation — a stolen token is valid until expiry

---

## [2025] Server-side history and favorites sync for authenticated users

**Decision:** When a user is logged in, query history and favorite queries are synced to the server (`data/users/<username>.json`). Anonymous users keep localStorage-only storage.

**Rationale:**
- Solves the core pain point: history and favorites vanish when clearing cache or opening a private window
- File-based store is trivial to implement and maintain for a single-user or small-team deployment
- Auto-save is debounced (800 ms) to avoid hammering the server on every keystroke

**Trade-off:**
- Plain JSON files on disk — not suitable for multi-instance deployments or high concurrency. A SQLite or Postgres store would be needed at scale
- On login, server data fully replaces local state — if the user had unsaved local data in another browser, it is overwritten

---

## [2025] AI SQL assistant uses Claude via server-side API call

**Decision:** The "AI Help" panel sends a natural-language prompt + current table schema to the Express backend (`/api/ai/sql`), which calls the Anthropic API (`claude-haiku-4-5-20251001`) and returns raw SQL.

**Rationale:**
- API key stays on the server — never exposed to the browser
- Schema context (table names + column types) is fetched client-side and included in the request body, giving the model enough information to produce accurate JOIN/GROUP BY queries
- `claude-haiku-4-5-20251001` is fast and cheap for this use case
- Feature is entirely opt-in: the UI hides the button when `ANTHROPIC_API_KEY` is not set; the endpoint returns 503 gracefully

**Trade-off:**
- Requires auth to prevent anonymous users from burning the API key — the endpoint is gated behind `requireAuth`
- No streaming — the full SQL is returned as one response. Acceptable for queries which are short
