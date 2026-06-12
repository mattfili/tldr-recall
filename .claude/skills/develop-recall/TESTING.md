# Testing & verification conventions

## Backend (`uv run pytest` from `backend/`)

- **The suite self-provisions its database** (`tests/conftest.py`): locally it creates,
  migrates, and seeds `recall_pytest` on the configured Postgres server and rewires
  `DATABASE_URL` before any `recall.*` import. `CI=true` is a strict pass-through (CI
  provides its own migrated+seeded DB). `RECALL_PYTEST_DB=<name>` overrides.
  Consequences:
  - The dev database (which may hold a real ingested corpus) is **never** touched by tests.
  - **Never name a scratch DB `recall_test`** — that throwaway is owned by
    `test_embeddings.py`/`test_search_hybrid.py`, and the hybrid leak-guard asserts zero
    `fake-%` embedding rows in the configured DB.
- **Mode-agnostic tests** (ADR-0003): search runs hybrid where embeddings exist and
  FTS-only where they don't (CI is keyless). Never assert embedding row counts or
  vector-arm participation unconditionally.
- **No network, ever**: the URL resolver takes an injectable httpx client — use a
  transport that *raises on any request* to prove decode paths are offline, and a
  counting transport to prove caching. The fake embedder covers the vector path.
- **Fixtures are built at runtime**: synthetic `.eml` via `email.message.EmailMessage`
  into `tmp_path`. Parser golden tests iterate the operator's local corpus when present
  and `pytest.skip` cleanly when absent. Never commit `.eml`/`.mbox`.
- **Rerun-safe state**: contract tests that mutate per-reader state restore it
  (try/finally) so the suite passes in any order, twice in a row.
- **Idempotency is a test target**: re-running ingest must create zero duplicates
  (content_hash, unique(issue_id, content_id)).

## Frontend (`npm run typecheck && npm run lint && npm run build && npm test -- --run`)

- **Always `npm test -- --run`** — bare `npm test` is vitest watch mode and never exits.
- Mock at the seam, not the vendor: analytics tests mock `../analytics`, never posthog-js;
  platform tests stub the bridge object. Tests must be mutation-killing (deleting the
  behavior under test must fail them).
- Date-dependent assertions use fixtures computed relative to "today" (no fake timers
  needed) or pass an injected `now`.
- After any frontend change: `git diff --stat frontend/src/styles/` must be empty
  (recall.css byte-identical) unless the change is explicitly design-system work.

## Real-browser verification (Playwright + system Chrome)

```js
const b = await chromium.launch({ channel: "chrome", headless: true });
```
- Drive `http://localhost:5173` — **never 127.0.0.1** (backend CORS allowlist).
- Search: click the "Smart search" button, fill `getByPlaceholder(/Ask your library/i)`,
  press Enter; allow ~2.5s (the vector arm round-trips to the embeddings API).
- **Playwright's actionability auto-scroll** will scroll off-viewport elements into view
  before clicking — when asserting scroll position, click only in-viewport elements.
- Chrome `innerText` applies `text-transform` — assert label text case-insensitively.
- The Library header shows the TOTAL plus "N match filters" when filtered — don't assert
  the total changes.

## Desktop

- Pure logic (URL validation) lives in importable helpers tested with `node --test`
  (one-shot). Security posture is audited in review: contextIsolation/sandbox on the
  external view, no preload into external content, scheme allowlists at every entry.
- Live smoke: Playwright `_electron.launch({ executablePath })` against the dev stack or
  a packaged `.app` — never launch `electron .` as a bare agent command (never exits).

## Mobile

- `npx tsc --noEmit` type-checks the shared frontend tree through the `web-src` symlink;
  `npx expo export` proves both the native and `'use dom'` bundles compile (this is the
  CI job).
- The exported DOM bundle can be booted in a plain browser for verification by stubbing
  the native host before load: `$$EXPO_DOM_HOST_OS`, `$$EXPO_INITIAL_PROPS`
  (`{names: [...fnProps], props: {}}`), and `window.ReactNativeWebView`
  (`{postMessage, injectedObjectJson}`). Audit exported bundles: the mobile env module
  must be baked in (no `import.meta`), and no `frontend/node_modules` content may appear
  (duplicate-React guard).

## Agent/automation discipline

Never run watch-mode or never-exiting commands (vitest watch, dev servers, bare
`electron .`) inside automated agents — they hang the run. Builds and one-shot test
invocations only; orchestrate live servers from the supervising process.
