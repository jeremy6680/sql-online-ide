# DECISIONS.md — SQL Online IDE

Architectural and technical decisions, with rationale and trade-offs.
Most recent entries first.

---

## [2026] Per-user API keys, encrypted at rest — no server-wide fallback

**Decision:** Users store their own Anthropic and/or OpenAI API keys via Settings → API Keys. Keys are encrypted with AES-256-GCM before being written to `data/users/<username>.json`. The raw key is never returned to the browser — only a boolean indicating presence. No server-side env var fallback: if a user has no key configured, AI features are unavailable for that user.

**Rationale:**
- The `ANTHROPIC_API_KEY` env var was previously a shared server key, meaning any authenticated user could burn it. Per-user keys give each person full control and accountability
- Removing the fallback prevents the admin key from being used as a silent crutch — the user must explicitly configure their own key
- AES-256-GCM provides authenticated encryption (AEAD): tampering with the stored ciphertext is detectable
- The encryption key is derived via `scryptSync` from `ENCRYPTION_KEY` env var, keeping derivation deterministic across server restarts while still stretching the secret to the required 32 bytes
- The frontend never needs the raw key — only the server uses it at call time

**Trade-off:**
- Changing `ENCRYPTION_KEY` invalidates all stored keys — users must re-enter them. This is a deliberate hard failure rather than a silent wrong decryption
- In-memory key derivation on every encrypt/decrypt call; `scryptSync` is intentionally slow — acceptable given the low frequency of API calls

---

## [2026] Self-registration with file-based user store; in-memory reset tokens

**Decision:** User accounts can be created via the UI when `ALLOW_REGISTRATION=true`. Registered users are stored in `data/auth/users.json` (bcrypt 12 rounds). Password reset tokens are stored in-memory (Map), expire after 1 hour, and are invalidated after use or when a new token is issued for the same user.

**Rationale:**
- The existing `AUTH_USERS` env var pattern required admin action to create every account — impractical once the tool is shared with a team
- `data/auth/users.json` follows the same file-based pattern already used for `data/users/<username>.json` — no new infrastructure
- In-memory tokens are sufficient for a single-instance self-hosted deployment; they auto-expire and require no schema migration
- One active token per user prevents token accumulation

**Trade-off:**
- Reset tokens are lost on server restart — users would need to request a new link. Accepted for the target deployment model (low restart frequency)
- Not suitable for multi-instance deployments (tokens aren't shared between processes); a shared store (Redis, file) would be needed at scale

---

## [2026] Internationalisation (i18n) with i18next — EN and FR

**Decision:** All UI strings are externalised via `i18next` + `react-i18next`. The language preference is stored in Zustand (persisted to localStorage and synced to the server). Language detection falls back to the browser's `navigator.language`.

**Rationale:**
- The primary target audience includes French-speaking users (ENI SQL certification is French)
- Externalising strings at the start is cheaper than retrofitting later
- i18next is the de-facto standard in the React ecosystem; `react-i18next` hooks (`useTranslation`) integrate cleanly with the existing component structure

**Trade-off:**
- Adds a translation maintenance burden — any new UI string must be added to both `en` and `fr` translation files
- Machine-translated strings may be imprecise; should be reviewed by a native speaker

---

## [2026] ENI SQL certification prep: server-side generation, client-side evaluation

**Decision:** Exam questions are generated server-side (Claude API, `POST /api/cert/question`). For practical (cas pratique) questions, SQL evaluation happens entirely client-side: the browser runs both the correct SQL and the user's SQL in an isolated, ephemeral `sql.js` database instance (`runSQLiteIsolated`), then compares the result sets.

**Rationale:**
- Generation needs Claude — keeping the API key on the server is non-negotiable (same pattern as `/api/ai/sql`)
- Evaluation does **not** need the server: sql.js already runs as WASM in the browser. Creating a fresh `sql.js` `Database()` per question avoids adding a SQLite dependency on the server and avoids round-trips
- The isolated instance is closed immediately after evaluation — the exam schema never pollutes the user's main database
- QCU/QCM answers are included in the server response and evaluated client-side (this is a learning tool, not a proctored exam — the trade-off is accepted)
- Result comparison normalises column order (case-insensitive sort) and row order (lexicographic sort on stringified values), making it ORDER BY-agnostic

**Trade-off:**
- Technically the user could inspect the network response to see the correct answer for QCU/QCM; acceptable for a self-study context
- Claude occasionally generates `correctSQL` that does not perfectly match the prose description — no server-side validation of generated questions. If Claude's SQL is wrong the comparison still works (user matches Claude's answer, which may itself be imperfect)

---

## [2026] Settings dropdown replaces individual toolbar buttons for theme, shortcuts, and auth

**Decision:** The keyboard-shortcuts button, theme toggle, and login/logout button are collapsed into a single `⚙️` Settings dropdown in the toolbar.

**Rationale:**
- The toolbar was growing wide enough to require horizontal scrolling on smaller screens
- These three actions are infrequent (set once per session) compared to Run, Format, History, AI Help, ENI — burying them one level deeper has minimal UX cost
- The dropdown pattern already exists in the codebase (Import, Export) — no new pattern needed

**Trade-off:**
- Theme toggle is now one extra click away; power users who switch themes frequently may prefer the old button. Accepted: the target user switches theme at most once per session

---

## [2026] ENI SQL certification prep: server-side generation, client-side evaluation

**Decision:** Exam questions are generated server-side (Claude API, `POST /api/cert/question`). For practical (cas pratique) questions, SQL evaluation happens entirely client-side: the browser runs both the correct SQL and the user's SQL in an isolated, ephemeral `sql.js` database instance (`runSQLiteIsolated`), then compares the result sets.

**Rationale:**
- Generation needs Claude — keeping the API key on the server is non-negotiable (same pattern as `/api/ai/sql`)
- Evaluation does **not** need the server: sql.js already runs as WASM in the browser. Creating a fresh `sql.js` `Database()` per question avoids adding a SQLite dependency on the server and avoids round-trips
- The isolated instance is closed immediately after evaluation — the exam schema never pollutes the user's main database
- QCU/QCM answers are included in the server response and evaluated client-side (this is a learning tool, not a proctored exam — the trade-off is accepted)
- Result comparison normalises column order (case-insensitive sort) and row order (lexicographic sort on stringified values), making it ORDER BY-agnostic

**Trade-off:**
- Technically the user could inspect the network response to see the correct answer for QCU/QCM; acceptable for a self-study context
- Claude occasionally generates `correctSQL` that does not perfectly match the prose description — no server-side validation of generated questions. If Claude's SQL is wrong the comparison still works (user matches Claude's answer, which may itself be imperfect)
- `runSQLiteIsolated` re-initialises the WASM module per call; `initSqlJs` is cached by the browser so the overhead is small in practice

---

## [2026] Settings dropdown replaces individual toolbar buttons for theme, shortcuts, and auth

**Decision:** The keyboard-shortcuts button, theme toggle, and login/logout button are collapsed into a single `⚙️` Settings dropdown in the toolbar.

**Rationale:**
- The toolbar was growing wide enough to require horizontal scrolling on smaller screens
- These three actions are infrequent (set once per session) compared to Run, Format, History, AI Help, ENI — burying them one level deeper has minimal UX cost
- The dropdown pattern already exists in the codebase (Import, Export) — no new pattern needed

**Trade-off:**
- Theme toggle is now one extra click away; power users who switch themes frequently may prefer the old button. Accepted: the target user switches theme at most once per session

---

## [2026] Engine selector: compact dropdown replaces button group

**Decision:** The five engine buttons (SQLite, DuckDB, MySQL, MariaDB, PostgreSQL) in the toolbar were replaced with a single compact dropdown.

**Rationale:**
- The button group occupied significant horizontal space, especially on narrower screens
- Five engines is enough that a dropdown is more scalable if more engines are added
- The active engine label + colour badge still gives immediate visual feedback

**Trade-off:**
- One extra click to switch engines vs. direct button press; accepted given that engine switching is infrequent during a session

---

## [2026] sql-formatter for in-editor SQL formatting

**Decision:** `sql-formatter` (npm) is used for the "Format" button. Formatting is applied on demand (button click), not live.

**Rationale:**
- Dialect-aware: supports sqlite, mysql, mariadb, postgresql, and generic SQL (used for DuckDB)
- Applied via `EditorView.dispatch()` on the CodeMirror instance — no editor recreation needed
- `EditorHandle` interface exposes `formatSQL()` via `useImperativeHandle`/`forwardRef`

**Trade-off:**
- Adds ~200 KB to the bundle (tree-shaken)
- The formatter may rewrite valid but unusual SQL in unexpected ways — user can always undo (`Ctrl+Z`)

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
- Schema compartment must be reconfigured (not recreated) when tables change — use `Compartment.reconfigure()` to avoid destroying editor state

**Update (2026):** Schema-aware autocompletion is now wired: table and column names are loaded on every `tables` state change and pushed into a dedicated `schemaCompartment`, giving context-aware suggestions.

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
