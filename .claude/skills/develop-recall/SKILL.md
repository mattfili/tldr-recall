---
name: develop-recall
description: Develop on the Recall codebase (TLDR newsletter reader + semantic search) — the domain language, hard invariants, per-package gates, and the swappable seams (ingestion source, embedder, auth, analytics, deploy target). Use when building features, fixing bugs, swapping a backend/provider, or deploying this repo, especially as a third party without the original operator's context.
---

# Developing Recall

## Read first, in precedence order

1. **CONTEXT.md** — the domain glossary. Use its terms exactly (Content vs Article, Appearance, Edition vs Issue, Sponsor block, Engagement). Misusing a term is a bug.
2. **docs/adr/** — decision records. ADR-0001 (canonical Content + appearances), ADR-0002 (read state is per-Issue), ADR-0003 (search degrades to lexical-only without embeddings).
3. **Recall-Build-Spec.md** — the original spec. **CONTEXT.md and ADRs override it on conflict.**

`docs/agents/` defines the issue-tracker and triage-label conventions.

## Hard invariants (every change, no exceptions)

- **`frontend/src/styles/recall.css` is byte-identical** unless the change is explicitly about the design system; if styling is genuinely needed, append additive rules — never modify existing ones. The codebase idiom is the `mono` class + inline styles with CSS variables.
- **Repositories are the only ORM access point** (`backend/recall/repositories/`). No SQLAlchemy outside them. Repos flush; callers own commits.
- **Pydantic schemas mirror into `frontend/src/types.ts`** — change one, change both.
- **GET endpoints are side-effect free** (mark-on-view and saves are explicit client-fired writes).
- **No module imports a concrete backend** — everything pluggable goes through a seam (see [SEAMS.md](SEAMS.md)). `frontend/src/env.ts` is the only file allowed to touch `import.meta`.
- **Never commit secrets or personal email** — `.env`, `samples/`, `*.eml`, `*.mbox` are gitignored; test fixtures are built at runtime, never committed.

## Gates (all green before any PR)

```sh
cd backend  && uv run ruff check . && uv run pytest        # self-provisions a seeded test DB
cd frontend && npm run typecheck && npm run lint && npm run build && npm test -- --run
cd desktop  && npm run build && npm test                   # if desktop/ touched
cd mobile   && npx tsc --noEmit && npx expo export         # if mobile/ or shared frontend touched
```

Never run bare `npm test` (vitest watch mode never exits) or start dev servers inside automated agents. Test conventions, DB discipline, and browser-verification recipes: [TESTING.md](TESTING.md).

## Workflow conventions

- GitHub Issues (`gh`) is the canonical tracker; triage labels per `docs/agents/triage-labels.md` (`ready-for-agent` means fully specified).
- Branch per change → PR → **merge commits** (`gh pr merge N --merge`), never squash, never push to `main`.
- CI (`.github/workflows/ci.yml`) runs backend (fresh migrated+seeded Postgres, keyless → degraded search mode), frontend, and mobile jobs.

## What is user-specific (do NOT treat as part of the product)

- **The Railway project** in `infra/notes.md` is one reference deployment, not a dependency. The portable deploy contract is in [SEAMS.md](SEAMS.md) § Deploy target.
- **Gmail** is one `IngestionSource` implementation (`gmail_export` reads RFC822 files from a folder; the dump job is operator tooling). Newsletters arriving any other way only need a new source class — parsing and the pipeline are source-agnostic.
- The operator's corpus, OpenAI key, PostHog project, and admin token are environment, not code. Everything configurable lives in `.env.example`.

## Architecture in one breath

FastAPI + SQLAlchemy + Alembic over Postgres/pgvector; ingestion = source → parser → resolve/classify → idempotent pipeline (ADR-0001 dedupe); hybrid search = FTS + vectors fused with RRF (ADR-0003 degradation); React+Vite frontend shared verbatim by the web demo, the Electron shell (`desktop/`, hardened in-app browser), and the Expo DOM-component shell (`mobile/`, via the `web-src` symlink — see `mobile/README.md` for the Metro gotchas).
