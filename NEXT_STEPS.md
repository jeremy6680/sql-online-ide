# NEXT_STEPS.md — SQL Online IDE

Prioritised backlog. Items at the top of each section are highest priority.

---

## 🔴 Accessibility (P0 — fix before anything else)

- [x] **Add `aria-label` to all icon-only buttons** — every icon-only button in the toolbar has an explicit `aria-label` (App.tsx).
- [x] **Engine selector keyboard navigation** — engine pill buttons are wrapped in `role="group"` + `aria-label="Database engine"` (App.tsx:409).
- [x] **ConnectionModal focus trap** — when the modal is open, keyboard focus must be trapped inside it. Currently, Tab can escape the modal.
- [x] **Drop table confirmation** — the inline confirm/cancel flow in `Sidebar.tsx` has no ARIA live region; screen readers won't know a confirmation appeared.
- [ ] **ResultsTable column sort** — if sort is added, use `aria-sort` on `<th>` elements.
- [x] **Error messages** — query errors in `ResultsTable` should use `role="alert"` so screen readers announce them automatically.

---

## 🟠 UX Improvements (P1 — high value, low risk)

- [x] **Schema-aware SQL autocompletion** — wire the live tables/columns list from the Zustand store into CodeMirror's `sql({ schema })` option. Currently, autocompletion is keyword-only.
- [x] **Resizable panels** — the editor/results split and the sidebar width are fixed. A drag handle would let users adjust the layout.
- [x] **Keyboard shortcut reference** — add a `?` button or `Ctrl+/` shortcut that shows a modal listing all keyboard shortcuts (`Ctrl+Enter` to run, etc.).
- [x] **Multi-statement execution feedback** — when running multiple statements, show which statement produced the displayed result (e.g. "Showing result of statement 3/3").
- [x] **Export CSV** — add CSV export alongside the existing XLSX export. CSV is more universal for data pipelines.
- [x] **Copy cell / copy row** — right-click context menu or button on the results table to copy a cell or row value.
- [x] **NULL / type badges in results** — visually distinguish NULL, boolean, number, and string values in the results table (already partial — NULLs are italic, booleans are coloured).

---

## 🟡 Features (P2 — grow the product)

- [x] **Named query tabs / multi-buffer** — allow multiple open queries, switchable via tabs. Essential for comparing queries or working on several at once.
- [x] **Import CSV/JSON/Parquet into DuckDB** — DuckDB can query these file formats natively. A dedicated import flow (drag & drop → auto-`COPY FROM`) would be a flagship DuckDB feature.
- [ ] **Query result diffing** — compare two query results side by side (added/removed rows highlighted). Useful for dbt-style before/after comparisons.
- [ ] **Schema documentation panel** — add a description field to tables/columns (stored in localStorage or a sidecar JSON). Useful for learning and for the DataBird bootcamp context.
- [ ] **dbt-style query organisation** — group favorite queries into folders (e.g. "staging", "marts"). Maps to the medallion architecture mental model.
- [ ] **Execution plan viewer** — for SQLite (`EXPLAIN QUERY PLAN`) and DuckDB (`EXPLAIN ANALYZE`), parse and display the output in a readable tree or diagram. *(attempted and removed — UX was poor)*
- [x] **Query formatting (Prettier SQL)** — a "Format" button that reformats the SQL in the editor using a SQL formatter library.
- [x] **Share query via URL** — encode the current SQL + engine in the URL hash so queries can be shared as links.

---

## 🔵 Technical Debt & Hardening (P3)

- [ ] **Don't persist `remoteConnection.password` in localStorage** — currently the active connection (including password) is persisted. Better: store host/user/db only, prompt for password on reconnect.
- [ ] **Limit localStorage growth** — query history is capped at 100 entries in code, but the Zustand `persist` payload can still grow large. Add a size guard or TTL-based eviction.
- [ ] **Error boundaries** — add React error boundaries around the editor, results, and chart panels so a crash in one panel doesn't take down the whole app.
- [ ] **Loading state for DuckDB init** — the first DuckDB query can take 1–2 seconds to initialise the WASM engine. Show a meaningful loading indicator rather than the generic spinner.
- [ ] **Vite dev proxy resilience** — if the Express server isn't running, `/api/*` requests fail silently. Show a clear "Backend not running" message when remote engine requests fail with a network error.
- [ ] **TypeScript strict mode** — enable `strict: true` in `tsconfig.json` and fix resulting type errors. Currently some implicit `any` slips through.
- [ ] **Unit tests** — add Vitest tests for the engine wrappers (especially the multi-statement MySQL result extraction logic in `server/mysql.ts`).

---

## ✅ Done

- [x] SQL editor with CodeMirror 6 (syntax highlight, autocompletion, `Ctrl+Enter` to run)
- [x] SQLite engine (sql.js WASM)
- [x] DuckDB engine (duckdb-wasm)
- [x] MySQL / MariaDB via Express proxy
- [x] PostgreSQL via Express proxy
- [x] Table explorer sidebar with column drill-down
- [x] Drop table with confirmation
- [x] Query history (last 100, click to restore)
- [x] Favorite queries (named, engine-tagged)
- [x] Saved connections (reuse without re-entering credentials)
- [x] Chart visualisation (bar, line, pie, bubble)
- [x] Import `.db` / `.sqlite` / `.sqlite3` / `.sql`
- [x] Export results as `.xlsx`
- [x] Light / dark theme (Tokyo Night dark + clean light)
- [x] Docker + Coolify deployment
- [x] COOP/COEP headers for DuckDB SharedArrayBuffer
- [x] Test connection endpoint
- [x] Paginated results table (100 rows per page)
- [x] ERD schema diagram tab with FK relationship arrows (`SchemaView.tsx`)
- [x] Optional multi-user JWT authentication (`LoginPage.tsx`, server-side middleware)
- [x] Server-side sync for history, favorites, and saved connections
- [x] AI SQL assistant — plain-language → SQL via Claude API (`AIHelpPanel.tsx`)
