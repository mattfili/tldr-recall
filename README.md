# Recall

Recall is a reading, saving, and semantic-search client for the [TLDR](https://tldr.tech) family of newsletters. It ingests TLDR issues into a canonical, globally-deduplicated **Library** of **Content**, lets a reader browse and search their accumulated history by meaning, star what they want to return to, and (on desktop) open links in an in-app browser. It ships as both an Electron desktop app and a hosted web demo from one codebase. See the full [Recall Build Spec](./Recall-Build-Spec.md) and the domain glossary in [CONTEXT.md](./CONTEXT.md).

## Milestone

This is **M0 — Scaffold & health endpoint** ([issue #1](https://github.com/mattfili/tldr-recall/issues/1)). It stands up the monorepo skeleton, the four portability seams as protocols, local Postgres + pgvector, CI, and a green `GET /health` the frontend renders on load to prove the client → API → DB path. See all issues at https://github.com/mattfili/tldr-recall/issues.

## Prerequisites

- [uv](https://docs.astral.sh/uv/) — Python toolchain & package manager (backend targets Python 3.12)
- [Node](https://nodejs.org/) (with `npm`) — frontend (Vite + React + TS) and desktop (Electron)
- [Docker](https://docs.docker.com/get-docker/) (with Compose) — local Postgres + pgvector

## Quickstart (fresh clone)

```sh
# 1. Configuration
cp .env.example .env

# 2. Database — Postgres + pgvector on localhost:5432
docker compose up -d db

# 3. Backend — FastAPI on http://localhost:8000
cd backend && uv sync && uv run uvicorn recall.main:app --reload
cd ..

# 4. Frontend — Vite dev server on http://localhost:5173
cd frontend && npm install && npm run dev
cd ..

# Open http://localhost:5173 to see the live /health status
# (status / db / embedder / version), proving client → API → DB is wired.

# 5. Desktop (optional) — Electron shell loading the frontend build
cd desktop && npm install && npm start
```

A `Makefile` wraps the common tasks — run `make help` for the list (`make up`, `make backend`, `make frontend`, `make desktop`, `make test`, `make lint`). `make migrate` / `make seed` are placeholders until #2.

## Health contract

`GET /health` returns:

```json
{
  "status": "ok",
  "db": "ok",
  "embedder": "text-embedding-3-small",
  "version": "0.1.0"
}
```

- `db` reflects a real `SELECT 1` against `DATABASE_URL` (`error: <msg>` on failure).
- `embedder` is the configured embed model name, or `unconfigured` if no backend is set. No embedder is instantiated yet — the concrete backend lands in #6.
- `version` is `recall.__version__`.

## Privacy note (analytics)

Product analytics (PostHog, §12.4 of the spec) is **off** unless a key is set. When enabled, events are captured anonymously with no PII, the web demo shows a decline-by-default consent banner, and Do-Not-Track is honored. Raw per-user search text is acceptable for the single-user demo, but a multi-user product must aggregate/anonymize queries rather than store raw per-user text.

## Repository layout

```
backend/    Python / FastAPI / uv          (app factory, config, db, the four seam protocols)
frontend/   React + TypeScript + Vite      (shared by Electron renderer + web demo)
desktop/    Electron main process          (loads the built frontend)
infra/      Railway deploy config + notes  (placeholder until M6)
```

The four portability seams land now as protocols (per spec §20.2 — far easier to start with than to retrofit): `Embedder`/`Reranker` (embeddings), `IngestionSource` + DTOs (ingestion), and `AuthProvider` (auth). Concrete implementations arrive in later milestones.
