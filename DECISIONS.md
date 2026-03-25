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

## [2025] No authentication layer

**Decision:** The app ships with no authentication.

**Rationale:**
- Target audience is personal / small-team use, self-hosted
- Adding auth would significantly increase complexity and maintenance burden
- The README explicitly warns against public exposure without auth

**Future option:** HTTP Basic Auth via the reverse proxy (Coolify/Nginx), or a simple Express middleware, would be sufficient for most use cases.
