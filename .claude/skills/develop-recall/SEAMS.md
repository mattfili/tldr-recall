# The swappable seams

Every external dependency sits behind a protocol with a config-selected implementation.
**No module imports a concrete backend** — that rule is what makes each swap a single new
class plus an env var. Factories live next to their protocols.

## Ingestion source (`backend/recall/ingestion/`)

- **Protocol**: `IngestionSource.fetch(since) -> Iterable[RawIssue]` (`base.py`, with the
  `RawIssue/RawSection/RawArticle` DTOs). Selected by `RECALL_INGEST_SOURCE`.
- **Reference impl**: `gmail_export.py` — reads RFC822 `.eml` files from `GMAIL_EXPORT_DIR`.
  Gmail itself is NOT a dependency: anything that yields RFC822 bytes (another mail
  provider, an archive, a future first-party REST feed per the `tldr_rest` stub) just
  implements `fetch()`. The dump job (`jobs/gmail_dump.py`) is operator tooling, not product.
- **Downstream is source-agnostic and must stay that way**: `parser.py` (TLDR email HTML →
  DTOs; golden tests run over whatever corpus exists locally and skip in CI),
  `resolve.py` (tracking-link resolution, **cached in `url_resolutions` — one network hit
  per distinct link EVER**; never raises), `classify.py` (pure), `pipeline.py` (idempotent:
  issues keyed on `source_ref`; Content deduped globally on `sha256(normalized resolved
  URL)`, first-seen-wins editorial text per ADR-0001; editions/categories auto-create;
  **sponsor blocks are never stored** — CONTEXT.md). Re-running ingest is always safe.
- CLI: `recall ingest [--since] [--replace]` (`--replace` wipes demo data but preserves
  `url_resolutions`, editions, categories).

## Embedder / Reranker (`backend/recall/embeddings/`)

- **Protocols** in `base.py`; `factory.py` selects via `RECALL_EMBED_BACKEND`
  (`cloud` = any OpenAI-compatible embeddings API via `EMBEDDING_API_KEY` +
  `RECALL_EMBED_MODEL`/`RECALL_EMBED_DIM`; `fake` = deterministic, for tests/CI;
  a Qwen/local backend slots in the same way via `QWEN_ENDPOINT`).
- Rows are tagged by model name; **changing models with the same dim** = backfill under
  the new name + flip config. **Different dim** = migration (spec §7.5).
- **ADR-0003 is the safety net**: with zero embeddings or no key, search runs FTS-only
  and upgrades itself when `recall embed-backfill` runs. Tests must be mode-agnostic.

## Auth (`backend/recall/auth/`)

`AuthProvider.current_user(request)`; v1 ships the single-user stub. All per-reader state
(`user_content_state`, `user_issue_state`) already keys on `user_id`, so real auth is an
interface swap with no schema change. Admin surfaces use `RECALL_ADMIN_TOKEN`, independent
of user auth.

## Analytics (`frontend/src/analytics/`)

Typed event taxonomy behind a facade; **no component imports the vendor SDK**. No-op
unless a key is set AND consent is accepted AND DNT is off; the SDK loads via dynamic
import only on the enabled path. Swapping PostHog for anything = one new sink module.

## Platform (`frontend/src/platform/` + `desktop/` + `mobile/`)

`platform.openExternal(url)` is the one behavioral branch: web = new tab; Electron =
hardened in-app `WebContentsView` (http(s)-only — never weaken `validate-url.ts`);
mobile = native browser via a lazily-bound bridge function. A new host = a new shim
selected in `detectPlatform()`.

## Deploy target (portable contract — Railway is just the reference)

Any host providing these runs Recall:

1. **Postgres with the pgvector extension available** (migration 0001 runs
   `CREATE EXTENSION IF NOT EXISTS vector`).
2. **API**: build `backend/Dockerfile` (it runs `alembic upgrade head` before uvicorn —
   migrations-on-deploy is the contract), env per `.env.example` (`DATABASE_URL` must use
   the `postgresql+psycopg://` scheme), healthcheck `GET /health`.
3. **Web**: build `frontend/Dockerfile` (or any static host for `vite build` output) with
   `VITE_API_BASE_URL` baked at build time.
4. **CORS**: set `CORS_ALLOW_ORIGINS` to the web origin (+ `file://` and `null` for the
   desktop/mobile shells) and optionally `CORS_ALLOW_ORIGIN_REGEX` for dev-LAN origins.
   CORS here is plumbing, not security — v1 auth is a stub; treat the API as public.
5. **Data**: populate by running `recall seed` (demo fixture) or `recall ingest` +
   `recall embed-backfill` from any machine with `DATABASE_URL` pointed at the host.

`infra/notes.md` documents the reference Railway topology; `desktop/README.md` covers
installer builds (`VITE_API_BASE_URL=<api> npm run dist`) and the documented-not-executed
signing steps; `mobile/src/env.mobile.ts` defaults the shell's API target
(`EXPO_PUBLIC_API_URL` overrides).
