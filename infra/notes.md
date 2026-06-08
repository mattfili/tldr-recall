# Infra / deploy notes

> **Status: PLACEHOLDER.** Deployment is **M6** (see spec §14). Nothing here is
> wired up yet. This file documents the *intended* Railway topology so the deploy
> milestone has a starting point. `infra/railway.json` is a matching stub.

## Intended topology (spec §12.2)

A single Railway project, GitHub-connected, with three services:

1. **db — Postgres + pgvector** (already provisioned on Railway).
   - The `pgvector` extension is enabled via an Alembic migration that runs
     `CREATE EXTENSION IF NOT EXISTS vector;` (added in #2).
   - Dimension of the `content_embeddings.embedding` column matches
     `RECALL_EMBED_DIM` (1536 for `text-embedding-3-small`).

2. **api — FastAPI backend.**
   - Built from `backend/Dockerfile`.
   - Start command: `uvicorn recall.main:app --host 0.0.0.0 --port $PORT`.
   - Runs Alembic migrations on deploy.
   - Healthcheck path: `/health`.
   - Reads `DATABASE_URL` and the embedding/admin keys from Railway env vars
     (the backend keys from `.env.example` / spec §12.3). Never commit secrets.

3. **web — static frontend.**
   - Static build of `frontend/` (`npm ci && npm run build`) served by a tiny
     static server (or Railway static hosting).
   - `VITE_API_BASE_URL` set to the **api** service's public URL at build time.

## Ingestion

Manual trigger of `POST /admin/ingest` (guarded by `RECALL_ADMIN_TOKEN`) or a
scheduled job — added in M4. The export job (`recall.jobs.gmail_dump`, §6.8)
runs in the operator's environment; the backend stores no Gmail credentials.

## Desktop

Per spec decision §13.3, the desktop app talks to the hosted Railway **api**
service so desktop and the web demo share one living dataset (option A). A
bundled local backend (option B) is deferred to v2.

## TODO when M6 lands

- Replace `infra/railway.json` stub with real service definitions.
- Document the GitHub-connected deploy flow and required Railway env vars.
- Document macOS notarization + Windows signing secrets for `npm run dist`
  (electron-builder, §12.1).
