# Recall

Recall is a reading, saving, and semantic-search client for the [TLDR](https://tldr.tech) family of newsletters. It ingests TLDR issues into a canonical, globally-deduplicated **Library** of **Content**, lets a reader browse and search their accumulated history by meaning, star what they want to return to, and (on desktop) open links in an in-app browser. It ships as both an Electron desktop app and a hosted web demo from one codebase. See the full [Recall Build Spec](./Recall-Build-Spec.md), the domain glossary in [CONTEXT.md](./CONTEXT.md), and the decision records in [docs/adr/](./docs/adr/).

## Live demo

**https://web-production-f5d0f.up.railway.app** — the hosted web build (Railway: static web + FastAPI + Postgres/pgvector), running on a real ingested corpus with hybrid (lexical + vector) search. Provisioning details in [infra/notes.md](./infra/notes.md).

## Prerequisites

- [uv](https://docs.astral.sh/uv/) — Python toolchain & package manager (backend targets Python 3.12)
- [Node](https://nodejs.org/) 22+ (with `npm`) — frontend (Vite + React + TS) and desktop (Electron)
- [Docker](https://docs.docker.com/get-docker/) (with Compose) — local Postgres + pgvector

## Quickstart (fresh clone)

```sh
# 1. Configuration (set EMBEDDING_API_KEY for hybrid search; everything else has defaults)
cp .env.example .env

# 2. Database — Postgres + pgvector on localhost:5432
docker compose up -d db

# 3. Backend — migrate, seed, run FastAPI on http://localhost:8000
cd backend && uv sync
uv run alembic upgrade head
uv run recall seed                                # demo dataset (44 items)
uv run recall embed-backfill --backend cloud      # optional: lights up the vector arm
uv run uvicorn recall.main:app --reload
cd ..

# 4. Frontend — Vite dev server on http://localhost:5173
cd frontend && npm ci && npm run dev
cd ..

# 5. Desktop (optional) — Electron shell with the in-app article browser
cd desktop && npm ci && npm start
```

Without an `EMBEDDING_API_KEY`, search runs lexical-only and upgrades itself once embeddings exist ([ADR-0003](./docs/adr/0003-search-degrades-to-lexical-only.md)). A `Makefile` wraps common tasks — `make help`.

## Real corpus (instead of the seed)

The seed is a demo/test fixture. To run Recall on your actual TLDR history (operator-run, your own Gmail credentials — the backend never stores them):

```sh
cd backend
# one of:
uv run recall mbox-split ~/Downloads/takeout.mbox      # Google Takeout backfill
uv sync --group gmail && uv run recall gmail-dump      # Gmail API pull (OAuth client at ~/.recall/)

uv run recall ingest --replace                         # parse + resolve + dedupe into the DB
uv run recall embed-backfill --backend cloud           # embed the corpus
```

Ingestion is idempotent (rerun-safe), resolves each tracking link at most once ever, auto-creates editions/categories it hasn't seen, and skips sponsor blocks entirely. Details: spec §6 and [ADR-0001](./docs/adr/0001-canonical-content-with-appearances.md).

## Desktop installers

```sh
cd desktop
npm run dist        # macOS .dmg  -> desktop/release/
npm run dist:win    # Windows NSIS .exe (cross-builds on macOS)
```

Builds are unsigned and need zero secrets; `VITE_API_BASE_URL` is baked at build time (defaults to `http://localhost:8000` — bake the hosted API URL for a shareable build). Signing/notarization steps are documented in [desktop/README.md](./desktop/README.md).

## Testing & gates

```sh
cd backend && uv run ruff check . && uv run pytest     # pytest self-provisions a seeded
cd frontend && npm run typecheck && npm run lint \     # `recall_pytest` DB — your dev DB
  && npm run build && npm test -- --run                # (real corpus) is never touched
cd desktop && npm run build && npm test
```

CI runs the same gates against a fresh migrated + seeded Postgres service.

## Privacy note (analytics)

Product analytics (PostHog, spec §12.4) is **off** unless a key is set. When enabled, events are captured anonymously with no PII, the web demo shows a decline-by-default consent banner, and Do-Not-Track is honored. Raw per-user search text is acceptable for the single-user demo, but a multi-user product must aggregate/anonymize queries rather than store raw per-user text.

## Repository layout

```
backend/    Python / FastAPI / uv          (ingestion, embeddings, hybrid search, repositories)
frontend/   React + TypeScript + Vite      (shared by Electron renderer + web demo)
desktop/    Electron main process          (in-app article browser, installers)
infra/      Railway topology + deploy notes
docs/adr/   Decision records               (canonical content, per-issue read state, degraded search)
```

The portability seams are protocols with swappable implementations: `Embedder`/`Reranker` (cloud today, Qwen-ready), `IngestionSource` (Gmail export today, TLDR REST-ready), `AuthProvider` (stub today), and `Analytics` (no-op unless keyed).
