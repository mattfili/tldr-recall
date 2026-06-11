# Railway — hosted demo (issue #28, spec §12.2)

Provisioned 2026-06-11 via the Railway CLI/API. **GitHub-connected: merges to `main` auto-deploy both app services.**

## Project

| Thing | Value |
|---|---|
| Workspace | Matt Fili's Projects (`2884348b-0b3a-4f78-a282-3a80d9f8ed27`) |
| Project | `tldr-recall` (`ac2b90d9-f5cc-45a6-8cde-c72a51dea226`) |
| Environment | `production` (`4b1ababb-fc73-43db-8a99-f78f48fce923`) |
| **Web (shareable URL)** | https://web-production-f5d0f.up.railway.app |
| **API** | https://api-production-9cb1.up.railway.app |

## Services

1. **Postgres** (`df82aac2-…`) — Railway PostgreSQL template (volume + TCP proxy included).
   Migration `0001` runs `CREATE EXTENSION IF NOT EXISTS vector;` on first API deploy; if the
   image ever lacks pgvector, swap the service image to `pgvector/pgvector:pg16` *before* the
   first deploy. `content_embeddings` dimension matches `RECALL_EMBED_DIM` (1536).
2. **api** (`16202fe7-…`) — GitHub `mattfili/tldr-recall` @ `main`, rootDirectory `backend`,
   built from `backend/Dockerfile`. **Migrations run on every deploy** (image CMD =
   `alembic upgrade head && uvicorn`). Healthcheck `/health`.
3. **web** (`e4182993-…`) — GitHub `mattfili/tldr-recall` @ `main`, rootDirectory `frontend`,
   built from `frontend/Dockerfile` (Vite build → Caddy file server). `VITE_API_BASE_URL` is
   baked at **build** time via Docker ARG (Vite semantics — changing it means a web rebuild).

## Environment variables (names only — values live exclusively in Railway env)

- **api**: `DATABASE_URL` — the reference
  `postgresql+psycopg://${{Postgres.PGUSER}}:${{Postgres.PGPASSWORD}}@${{Postgres.RAILWAY_PRIVATE_DOMAIN}}:5432/${{Postgres.PGDATABASE}}`
  (private networking; the `+psycopg` scheme SQLAlchemy 2 requires — the template's raw
  `postgres://` URL is not accepted), `EMBEDDING_API_KEY`, `RECALL_ADMIN_TOKEN`,
  `CORS_ALLOW_ORIGINS` (JSON list incl. the web domain, localhost:5173, file://).
- **web**: `VITE_API_BASE_URL` → the API domain. Optional: `VITE_POSTHOG_KEY` to enable
  analytics (#24; consent-gated, no-op when absent).

## Populating the hosted DB (operator-run, from a laptop)

Ingestion is CLI-only (#26); the hosted API has no corpus access by design (§6.8).
Public connection string: Railway dashboard → Postgres → Connect → "Public Network"
(or `railway connect`); convert the scheme to `postgresql+psycopg://`.

```bash
cd backend
DATABASE_URL="postgresql+psycopg://<public-conn>" uv run recall ingest --replace
DATABASE_URL="postgresql+psycopg://<public-conn>" uv run recall embed-backfill --backend cloud
```

Until the real corpus exists, the same recipe with `uv run recall seed` instead of
`recall ingest --replace` gives the demo the seed dataset.

## Desktop installers (§12.1, #29)

`cd desktop && npm run dist` (mac .dmg) / `npm run dist:win` (NSIS .exe) → `desktop/release/`
(gitignored). v1 builds are **unsigned** and require zero secrets. Signing/notarization env
vars and config switches are documented in `desktop/README.md` — documented, not executed.
Founder-demo builds bake the hosted API:
`VITE_API_BASE_URL=https://api-production-9cb1.up.railway.app npm run dist`.
Auto-update (electron-updater) is out of scope for v1.

## Operating notes

- Deploys: merge to `main` → both `api` and `web` rebuild. Manual: `railway redeploy --service <name>`.
- Logs: `railway logs --service api --lines 200`. Status: `railway deployment list --json`.
- Desktop (§13 option A): cut founder builds with
  `VITE_API_BASE_URL=https://api-production-9cb1.up.railway.app npm run dist` (see #29 / desktop docs).
- The export job (`recall gmail-dump`, §6.8) stays in the operator's environment; the backend
  stores no Gmail credentials.
- Signing/notarization secrets for installers are documented with #29 (desktop), not here.
