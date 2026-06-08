# Recall — Build Specification

A reading, saving, and semantic-search client for the TLDR family of newsletters.

**Status:** Implementation-ready spec for handoff to Claude Code.
**Author of spec:** Matt Fili (matthewjosephfili@gmail.com)
**Repo:** https://github.com/mattfili/tldr-recall (currently empty, `main`)
**Design source:** `tldr-web/` (in-browser React prototype — the visual + interaction reference)

> **Revision — 2026-06-08 design session.** This spec was reconciled to a set of decisions captured authoritatively in **`CONTEXT.md`** (glossary) and **`docs/adr/0001-canonical-content-with-appearances.md`**. Where any older wording survives, those two files win. Headline changes, folded into the sections below:
> - **Genus renamed `Article` → `Content`.** "Article" is now *only* a `content_type` value; tables/endpoints/identifiers use `content` / `content_id` (§5, §7, §9).
> - **Canonical content + appearances** (ADR-0001): a `content` row is a globally-deduped link; each sighting in an issue is a `content_appearances` row carrying its category + position. Editorial text lives on `content` (first-seen-wins).
> - **Library = the whole corpus; star = a bookmark.** Search always ranges over all Content (§5 intro, §8, §10).
> - **Per-reader state decoupled:** `user_content_state` (`starred` default false, read-state independent of saving) replaces `saves` (§5.2, §9).
> - **Type routing is per-cue** (`RECALL_TYPE_FILTER_MODE=auto` default; tunable boost weight; hard negation) (§8.2, §12.3).
> - **Categories seed hue verbatim from `data.js`** — never `--c-${slug}` (§5.1, §5.4).

---

## 1. Context and intent

TLDR is a daily email newsletter (and several sub-editions: **TLDR**, **TLDR AI**, **TLDR Founders**, etc.). Each issue is a set of short, link-out summaries grouped into themed sections. The newsletter has no first-party way to **save** items, **come back** to them, or **search across history**. Recall adds exactly that.  

This project has two audiences and therefore two builds from one codebase:

1. **A desktop app (Electron)** — the primary artifact. It is meant to be "front and center" — a daily reader that lives on the dock, opens issues, lets you star/save items, and search your accumulated library by meaning. Easy to install (signed, bundled installers).
2. **A hosted web demo (on Railway)** — a link Matt can send to the TLDR founder so he can try the experience without installing anything. Same frontend, same API, same database.

The strategic goal is adoption: build the thing well enough that the founder wants to ship it. Therefore the spec optimizes for **portability and clean seams** over clever shortcuts. Two seams matter most:

- **The data source is a temporary ETL.** Today Recall ingests issues by reading Matt's Gmail (via the Gmail MCP) and parsing TLDR emails into a normalized model. This is explicitly disposable plumbing. The architecture must let TLDR swap it for a first-party **REST source** later without touching the frontend, the database schema, or the search layer. Build it behind an `IngestionSource` interface from day one.
- **The model backend is pluggable.** Search is powered by embeddings. The default backend is a cloud embedding API (cheap to run on Railway for the demo). The Qwen stack (Qwen3 / Qwen3-Embedding / Qwen3-Reranker-4B) is a **swappable backend behind an `Embedder`/`Reranker` interface**, enabled for local/offline desktop use later. No business logic may import a model SDK directly.

### Non-goals for v1
- Real authentication. Auth is **stubbed** behind an interface (see §11). A single implicit local user.
- Multi-user accounts, sharing, billing, mobile.
- Writing/sending email. Recall only **reads** newsletters.
- Re-hosting article content. Recall stores TLDR's summaries and links; full articles open in the in-app browser.

### Success criteria (v1 "demo-ready")
- A fresh clone, given a Railway Postgres URL and one API key, runs `uv` + `npm` and comes up with: backend API, ingestion that pulls the last N TLDR issues into Postgres, embeddings generated, and a desktop app + web build that reproduce the prototype's three views against live data.
- Searching "github repos about agents" returns repo-type items about agents, ranked sensibly; "anthropic ipo" returns the IPO items; "substacks I haven't read" filters by type + read-state.
- Clicking a result opens the source URL **inside** the app with a working back button.
- `npm run dist` produces an installer; the same frontend deployed to Railway is reachable by URL.

---

## 2. Stack summary

| Layer | Choice | Notes |
|---|---|---|
| Desktop shell | **Electron** (latest LTS, electron-builder) | Primary artifact. In-app browser via `WebContentsView`. |
| Frontend | **React + TypeScript + Vite** | Port of the prototype. One codebase renders both Electron renderer and web demo. |
| Styling | Existing **`recall.css`** design system (ported, see §10) | Schibsted Grotesk + JetBrains Mono, OKLCH palette, dark mode. |
| Backend | **Python + FastAPI** | Served by uvicorn. Pydantic v2 models. |
| Package mgr (Python) | **uv** | `pyproject.toml`, `uv.lock`. |
| Database | **Postgres + pgvector** on **Railway** | Already provisioned, GitHub-connected. |
| Embeddings/Rerank | **Pluggable.** Cloud embedding API default; Qwen stack swappable. | Behind `Embedder`/`Reranker` protocols. |
| Ingestion (temporary) | **Gmail MCP → parser → Postgres** | Behind `IngestionSource`; future `TLDRRestSource`. |
| Hosting (demo) | **All on Railway** | FastAPI service + static web build + Postgres in one project. |

---

## 3. High-level architecture

```
                          ┌──────────────────────────────────────────────┐
                          │                 CLIENTS                        │
                          │                                                │
   ┌───────────────┐      │   Electron desktop app        Web demo (SPA)   │
   │  In-app       │◄─────┤   (renderer = React)          (same React)     │
   │  browser      │      │            │                        │          │
   │ (WebContents) │      └────────────┼────────────────────────┼─────────┘
   └───────────────┘                   │  HTTPS / REST (JSON)    │
                                       ▼                        ▼
                          ┌──────────────────────────────────────────────┐
                          │              FastAPI backend                   │
                          │                                                │
                          │  /issues  /content   /library  /search  ...    │
                          │      │           │            │                │
                          │      ▼           ▼            ▼                │
                          │  ┌────────┐  ┌────────┐  ┌──────────────┐      │
                          │  │ Repos  │  │ Search │  │  Embeddings   │      │
                          │  │ (CRUD) │  │ service│  │  (Embedder /  │      │
                          │  └────┬───┘  └───┬────┘  │   Reranker)   │      │
                          │       │          │       └──────┬───────┘      │
                          └───────┼──────────┼──────────────┼──────────────┘
                                  ▼          ▼              ▼  (pluggable)
                          ┌──────────────────────────┐  ┌──────────────┐
                          │  Postgres + pgvector       │  │ Cloud embed  │
                          │  (Railway)                 │  │ API (default)│
                          │  issues / content  /       │  │  ── or ──    │
                          │  appearances / embeds ...   │  │ Qwen stack   │
                          └──────────▲─────────────────┘  └──────────────┘
                                     │  upsert normalized records
                          ┌──────────┴─────────────────────────────────┐
                          │      Ingestion (TEMPORARY ETL)               │
                          │                                              │
                          │   IngestionSource (interface)                │
                          │     ├─ GmailMCPSource   ← v1 (Gmail MCP)     │
                          │     └─ TLDRRestSource    ← future swap       │
                          │            │                                 │
                          │   parse → normalize → dedupe → persist       │
                          │            → enqueue embedding               │
                          └──────────────────────────────────────────────┘
```

**Golden rule of the seams:** clients only ever talk to the FastAPI backend. The backend only ever reads from Postgres for serving. Ingestion only ever *writes* normalized records into Postgres through the repository layer. Swapping Gmail→REST means writing one new `IngestionSource` implementation. Swapping cloud→Qwen means writing one new `Embedder`/`Reranker` implementation. Nothing else changes.

---

## 4. Monorepo layout

```
tldr-recall/
├── README.md
├── Recall-Build-Spec.md            # this document
├── .env.example                    # all config keys, documented
├── docker-compose.yml              # local Postgres+pgvector for dev
├── Makefile                        # common dev tasks (or justfile)
│
├── backend/                        # Python / FastAPI / uv
│   ├── pyproject.toml
│   ├── uv.lock
│   ├── Dockerfile                  # Railway service image
│   ├── alembic/                    # migrations
│   │   └── versions/
│   ├── recall/
│   │   ├── __init__.py
│   │   ├── main.py                 # FastAPI app factory, router mounting
│   │   ├── config.py               # pydantic-settings; reads env
│   │   ├── db.py                   # engine, session, pgvector registration
│   │   ├── models/                 # SQLAlchemy ORM models
│   │   ├── schemas/                # pydantic request/response models (API contract)
│   │   ├── repositories/           # data-access layer (the ONLY thing that touches ORM)
│   │   ├── api/                    # FastAPI routers: issues, content, library, search, health
│   │   ├── search/
│   │   │   ├── service.py          # hybrid search orchestration
│   │   │   ├── intent.py           # content-type intent routing
│   │   │   ├── fusion.py           # reciprocal-rank fusion
│   │   │   └── lexical.py          # Postgres FTS queries
│   │   ├── embeddings/
│   │   │   ├── base.py             # Embedder / Reranker protocols
│   │   │   ├── cloud.py            # default cloud embedder + reranker
│   │   │   ├── qwen.py             # Qwen stack backend (swappable)
│   │   │   └── factory.py          # picks backend from config
│   │   ├── ingestion/
│   │   │   ├── base.py             # IngestionSource protocol + normalized DTOs
│   │   │   ├── gmail_mcp.py        # GmailMCPSource (TEMPORARY)
│   │   │   ├── tldr_rest.py        # TLDRRestSource (future stub)
│   │   │   ├── parser.py           # TLDR email → structured issue/articles
│   │   │   ├── classify.py         # source-type + category classification
│   │   │   └── pipeline.py         # run: fetch → parse → normalize → persist → embed
│   │   ├── auth/
│   │   │   ├── base.py             # AuthProvider protocol
│   │   │   └── stub.py             # single implicit user (v1)
│   │   └── jobs/                   # CLI entrypoints (ingest, reindex, embed-backfill)
│   └── tests/
│
├── frontend/                       # React + TS + Vite (shared by Electron + web)
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── index.html
│   └── src/
│       ├── main.tsx                # web entry
│       ├── app/                    # App root, routing, AppContext (ported from prototype.jsx)
│       ├── views/                  # Editorial, Library, Search
│       ├── components/             # ContentItem, LibraryRow, TopBar, Filters, Share, atoms (ui.jsx)
│       ├── styles/recall.css       # ported design system
│       ├── api/                    # typed client for the FastAPI contract
│       ├── platform/               # platform shim (see §10.3)
│       │   ├── index.ts            # selects web vs electron impl
│       │   ├── web.ts              # opens links in new tab / overlay iframe
│       │   └── electron.ts         # opens links in in-app WebContentsView
│       └── types.ts                # shared TS types mirroring API schemas
│
├── desktop/                        # Electron main process
│   ├── package.json
│   ├── electron-builder.yml
│   └── src/
│       ├── main.ts                 # BrowserWindow + lifecycle
│       ├── browser.ts              # in-app browser (WebContentsView) + nav controls
│       ├── preload.ts              # contextBridge: exposes safe IPC to renderer
│       └── backend.ts              # optional: spawn/locate local backend (see §11.4)
│
└── infra/
    ├── railway.json                # service definitions / build config
    └── notes.md                    # deploy + provisioning notes
```

> Rationale: `frontend/` is platform-agnostic and never imports Electron. `desktop/` consumes the built frontend. The web demo builds `frontend/` directly. The `platform/` shim is the single place that branches behavior between Electron and web.

---

## 5. Data model (Postgres + pgvector)

The schema generalizes the prototype's `data.js`. The prototype conflates "an item in an issue" with "a saved item" via `starred`/`read_state` booleans on each record. We separate **canonical content** (issues, content, appearances — what TLDR published) from **per-reader state** (`user_content_state`: bookmarking + read state) so the model survives the move to multi-user and to a first-party source. The **Library is the whole corpus of content**; bookmarking ("save"/"star") is a flag on top, and search always ranges over everything (see `CONTEXT.md` and ADR-0001).

### 5.1 Enums

```
content_type   : article | repo | website | substack | paper        # data.js `src`
read_state     : unread | read
edition_key    : tldr | ai | founders | <extensible — store as text, seed these>
embedding_kind : title | summary | combined
```

Category is **not** an enum — store as a stable `slug` in a `categories` table so new TLDR sections (the parser will encounter unseen ones) insert cleanly. Seed with the prototype's set: `bigtech, science, prog, headlines, strategy, tools, deep, eng, misc`. Copy each category's `hue` **verbatim** from `data.js`'s `v` field (so `headlines`→`--c-strategy` and `eng`→`--c-ai`, which reuse another hue — there is no `--c-headlines`/`--c-eng` in `recall.css`); **never derive hue as `--c-${slug}`**. Seed `sort` from `CAT_ORDER`.

### 5.2 Tables

**`editions`** — the newsletter sub-brands.
```
id            uuid pk
key           text unique         -- 'tldr' | 'ai' | 'founders'
name          text                -- 'TLDR' | 'TLDR AI' | 'TLDR Founders'
sender_email  text                -- e.g. 'dan@tldrnewsletter.com' (matching hint for ingestion)
created_at    timestamptz
```

**`issues`** — one dated edition of a newsletter.
```
id            uuid pk
edition_id    uuid fk -> editions
issue_number  text                -- '#3120' (string; TLDR formats vary)
published_at  date                -- 'Tue, Jun 2 2026'
subject       text                -- raw email subject (with emoji)
subtitle      text                -- masthead sub line / dek
source_kind   text                -- 'gmail' | 'tldr_rest'  (provenance of this ingest)
source_ref    text                -- gmail message id, or REST id — for idempotent upsert
raw_uri       text null           -- optional pointer to stored raw email (object storage / null)
ingested_at   timestamptz
unique (edition_id, issue_number)
```

**`categories`**
```
id     uuid pk
slug   text unique          -- 'bigtech'
label  text                 -- 'Big Tech & Startups'
hue    text                 -- '--c-bigtech' (maps to recall.css var)
sort   int                  -- CAT_ORDER index
```

**`content`** — one canonical summarized link, deduplicated globally by `content_hash`. The core unit. Editorial text lives here (first-seen-wins); *where* it ran lives in `content_appearances` (ADR-0001).
```
id              uuid pk
title           text                 -- headline (data.js `title`)
summary         text                 -- TLDR's blurb (data.js `sum`)
content_type    content_type         -- classified src
read_minutes    int null             -- '(6 minute read)' → 6 ; null for repo/site
url             text                 -- resolved destination URL (see ingestion §6.4)
domain          text                 -- 'theverge.com' (display + favicon + type signals)
tags            text[]               -- optional; parser/classifier may seed, else empty
resources       jsonb null           -- [{k:'repo',label:'org/repo',meta:'1.2k ★ · MIT'}]
editor_note     text null            -- data.js `why`; kept nullable + unused in v1 (§13)
content_hash    text unique          -- hash(normalized resolved URL); identity for global dedup
first_seen_at   timestamptz          -- earliest ingest; tiebreak for "primary appearance"
created_at      timestamptz
```

**`content_appearances`** — one row per sighting of a piece of content in an issue. An issue is rendered by reading through its appearances.
```
id            uuid pk
content_id    uuid fk -> content     (on delete cascade)
issue_id      uuid fk -> issues      (on delete cascade)
category_id   uuid fk -> categories null   -- category can vary across editions
position      int                    -- order within the issue
created_at    timestamptz
unique (issue_id, content_id)
```

> Note: the prototype's `why` ("why saved" note) maps to `content.editor_note` (kept nullable + unused in v1, per §13). The `tabs` flag is dropped. `read_state`/`starred` move to `user_content_state` below.

**`content_embeddings`** — pgvector, one row per (content, kind, model). Each story is embedded **once** (canonical content), not per edition.
```
id             uuid pk
content_id     uuid fk -> content   (on delete cascade)
kind           embedding_kind       -- title | summary | combined
model          text                 -- e.g. 'text-embedding-3-small' (provenance)
dim            int                  -- vector dimension actually stored
embedding      vector(<DIM>)        -- pgvector column
created_at     timestamptz
unique (content_id, kind, model)
```
- Index: `CREATE INDEX ON content_embeddings USING hnsw (embedding vector_cosine_ops);`
- **Dimension strategy:** the column dimension must match the active embedding model. Because the model is pluggable, do **not** hardcode in app logic — read expected `dim` from config and assert at write time. If a second model is introduced, its rows carry a different `model` value (and may need a separate column/table if `dim` differs — see §7.5 migration note). For v1 single active model, one `vector(DIM)` column is sufficient.

**`users`** — stub; one seeded row in v1.
```
id          uuid pk
email       text unique null     -- nullable in stub mode
display_name text null
created_at  timestamptz
```

**`user_content_state`** — per-reader bookmarking + read state, keyed on canonical content. Replaces `starred`/`read_state` on items; read-state is **independent** of saving — a row exists after the first star *or* read.
```
id          uuid pk
user_id     uuid fk -> users
content_id  uuid fk -> content
starred     bool default false    -- bookmark flag; default false (a row no longer implies a star)
read_state  read_state default 'unread'
updated_at  timestamptz
unique (user_id, content_id)
```

**`collections`** — smart/AI-formed collections (data.js `COLLECTIONS`).
```
id          uuid pk
user_id     uuid fk -> users null   -- null = global/seeded
slug        text
label       text                    -- 'IPO Watch'
query       text                    -- 'IPOs and going public' (the semantic seed)
hue         text
is_smart    bool default true       -- smart = resolved live via search; static = membership table
created_at  timestamptz
```
Optional `collection_members(collection_id, content_id)` for pinned/static collections. v1: smart collections resolve by running their `query` through search at read time (count computed live, not stored — `data.js`'s `count` is ignored); membership table is a later optimization.

**`ingest_runs`** — observability for the ETL.
```
id            uuid pk
source_kind   text
started_at    timestamptz
finished_at   timestamptz null
status        text          -- running | ok | error
issues_seen   int
content_upserted  int
error         text null
```

### 5.3 Field mapping: `data.js` → schema (for the porting engineer)

| `data.js` field | Destination |
|---|---|
| `id` (slug) | not persisted; DB uses uuid. Keep a transient slug only if useful for fixtures. |
| `title` | `content.title` |
| `src` | `content.content_type` |
| `read` | `content.read_minutes` |
| `ed` | resolve to `editions.key` → the appearance's `issue` |
| `cat` | resolve to `categories.slug` → `content_appearances.category_id` |
| `domain` | `content.domain` |
| `tags` | `content.tags` |
| `sum` | `content.summary` |
| `why` | `content.editor_note` (nullable, unused v1) |
| `resources` | `content.resources` (jsonb) |
| `starred` | `user_content_state.starred` (per reader) |
| `read_state` | `user_content_state.read_state` |
| `tabs` | dropped |
| `ED_META[ed]` (name/date/issue/sub) | `issues` + `editions` |
| `COLLECTIONS` | `collections` |
| `CATS` | `categories` |

> Each `data.js` item (one `ed` + one `cat`) produces **one `content` row and one `content_appearances` row**. Real ingestion (M4) may attach further appearances to the same `content` when a link recurs across editions/issues.

### 5.4 Seed / fixtures
Ship a `backend/recall/jobs/seed.py` that loads the prototype's `data.js` content as fixtures so the frontend can be developed against a populated DB **before** Gmail ingestion is wired. Convert `data.js` to a JSON fixture (`backend/tests/fixtures/recall_seed.json`) during scaffolding. Each item seeds one `content` row + one `content_appearances` row; every `starred`/`read` item seeds a `user_content_state` row for the single stub user.

---

## 6. Ingestion — the temporary ETL (swap target)

This is the disposable plumbing. It is built behind one interface so the eventual move to a TLDR-provided REST feed is a single new class, not a rewrite.

### 6.1 The `IngestionSource` interface

```python
# ingestion/base.py
class RawIssue(BaseModel):        # normalized DTO, source-agnostic
    edition_key: str              # 'tldr' | 'ai' | 'founders'
    issue_number: str | None
    published_at: date
    subject: str
    subtitle: str | None
    source_kind: str              # 'gmail' | 'tldr_rest'
    source_ref: str               # idempotency key
    sections: list["RawSection"]

class RawSection(BaseModel):
    category_label: str           # raw header text, e.g. 'Big Tech & Startups'
    articles: list["RawArticle"]

class RawArticle(BaseModel):
    title: str
    summary: str
    raw_url: str | None           # tracking/redirect URL as found
    read_minutes: int | None
    resources: list[dict] | None

class IngestionSource(Protocol):
    def fetch(self, since: date | None) -> Iterable[RawIssue]: ...
```

The **pipeline** (`ingestion/pipeline.py`) is identical regardless of source:
```
for raw_issue in source.fetch(since):
    issue = upsert_issue(raw_issue)                 # idempotent on (edition, issue_number) / source_ref
    for section in raw_issue.sections:
        category = resolve_or_create_category(section.category_label)
        for raw_article in section.articles:
            url, domain = resolve_url(raw_article.raw_url)     # §6.4
            content_type = classify_type(domain, url, raw_article)   # §6.5
            content = upsert_content(raw_article, url, domain, content_type)  # global dedup on content_hash (ADR-0001)
            upsert_appearance(content, issue, category, position)            # the sighting in this issue
            enqueue_embedding(content.id)            # §7 — once per content
```
Idempotency + `content_hash` dedupe mean re-running ingestion is safe and cheap.

### 6.2 v1 source: `GmailMCPSource`

Uses the **Gmail MCP** (the connected MCP server) to read Matt's inbox. Responsibilities:
- Query for TLDR mail. Filter strategy: `from:dan@tldrnewsletter.com OR from:*@tldrnewsletter.com` (confirm exact senders during build — sample shows `TLDR AI <dan@tldrnewsletter.com>`). Map sender / subject prefix → `edition_key`.
- For each message, retrieve the **HTML body** (not the PDF — the PDFs in `tldr-web/uploads/` are only human reference samples). HTML is required because it carries the real anchor `href`s for each article (see §6.4).
- Emit `RawIssue` objects. The MCP boundary lives **only** in this file.

> Implementation note for Claude Code: the Gmail MCP is invoked by the agent/runtime, not by arbitrary Python at server runtime. Design `GmailMCPSource` so the *fetch step* can be driven either (a) by an operator running `uv run recall ingest` in an environment where the MCP/Gmail export is available, or (b) by accepting a folder of exported `.eml`/`.html` messages as an offline fallback (`GmailExportSource`). Build the **`.eml`/HTML file-folder source first** (deterministic, testable, no live creds), then layer the live MCP fetch on top. The sample emails (and the provided PDFs, as a last resort via the `pdf` parsing path) seed parser tests.

### 6.3 Parser (`ingestion/parser.py`)

Input: one TLDR email HTML body. Output: `RawIssue`.

Observed structure (from samples):
- **Masthead:** sender line → edition; `TLDR <edition> YYYY-MM-DD`; subject line with emoji → `subject`; the dek under the masthead → `subtitle`.
- **Sections:** emoji + bold header text (e.g. "🚀 Headlines & Launches", "Big Tech & Startups", "Science & Futuristic Tech", "Programming, Design & Data", "Deep Dives & Analysis", "Miscellaneous"). Each maps to a `category_label`.
- **Articles:** pattern `Title (N minute read)` (also `(N minute read)`, `(GitHub Repo)`, `(Sponsor)`) followed by one or more summary paragraphs until the next title/section. The visible title text is an anchor linking out.
- **Sponsor / "Together With" blocks:** detect and **skip** (do not store ads as articles). Heuristic: `(Sponsor)` suffix, "Together With", or known ad domains.
- Strip Gmail print chrome (`mail.google.com/...`, page-number footers) — only relevant if falling back to PDF parsing.

Parser must be tolerant: emoji in headers, missing read-time, multi-paragraph summaries, and unknown section names (create the category).

### 6.4 URL resolution (critical for quality)

TLDR article links are tracking/redirect URLs (e.g. analytics wrappers), not the destination. For correct `domain`, type classification, and de-duplication, resolve to the final URL:
- Prefer extracting the destination from the link if encoded in query params.
- Otherwise perform a **HEAD/GET with redirects** to capture the final `Location`. Do this in the ingestion environment (server-side), cache results, and respect timeouts/failures gracefully (fall back to the raw URL + best-effort domain).
- Persist both the resolved `url` and parsed `domain`.

> This network step lives only in ingestion, never in request-serving paths.

### 6.5 Source-type + category classification (`ingestion/classify.py`)

Map each article to a `content_type` ∈ {article, repo, website, substack, paper}. This drives both the type chip in the UI and search intent routing (§8). Signals, in priority order:
1. **Domain rules (deterministic):** `github.com` → `repo`; `*.substack.com` → `substack`; arxiv/ssrn/`*/research`/known journal domains/`.pdf` → `paper`; a bare product/tool homepage with no article path → `website`; everything else → `article`.
2. **TLDR's own label:** "(GitHub Repo)" suffix → `repo`, etc., when present.
3. **Resources block:** presence of a repo/paper resource pill reinforces the type.
4. Fallback → `article`.

Category mapping: normalize the section header label to a `categories.slug` via a lookup table seeded from the prototype, with fuzzy/contains matching; unknown labels create a new category row with a generated slug and default hue.

### 6.6 Scheduling
v1: manual/cron `uv run recall ingest --since <date>`. On Railway, expose as a scheduled job or a protected admin endpoint `POST /admin/ingest` (guarded by the auth stub / a shared secret). Each run writes an `ingest_runs` row.

### 6.7 Future swap: `TLDRRestSource`
Provide a stub implementing `IngestionSource.fetch` against a hypothetical TLDR REST feed, returning the same `RawIssue` DTOs. Document the expected upstream shape in `ingestion/tldr_rest.py` docstring so TLDR can map their feed to it. Selecting the source is config: `RECALL_INGEST_SOURCE=gmail_export|gmail|tldr_rest` (v1 default `gmail_export`).

### 6.8 Scriptable export (getting `.eml` into the folder)

`GmailExportSource` reads a folder of raw messages; this subsection specifies how that folder gets populated. Keep two layers separate: **byte acquisition** (Gmail → `.eml` files in `GMAIL_EXPORT_DIR`) and **parsing** (`parser.py`, which never cares how the files arrived). The exporter is a small standalone job (`backend/recall/jobs/gmail_dump.py`); both paths below write into the same folder the pipeline consumes, so ingestion is unchanged regardless of how bytes were fetched. This is the path we kick off first to get a real corpus on disk.

**One-time history backfill — Google Takeout.** Export Gmail as an mbox (filter to the TLDR label if one exists), then split the mbox into per-message `.eml` with a short script (Python `mailbox.mbox` → write each message). This yields the full historical corpus the search feature needs and doubles as a deterministic, replayable fixture set. Lowest-code way to seed everything at once.

**Incremental / rerunnable — Gmail API (`format=raw`).** Canonical scriptable path for ongoing pulls. List by query, fetch the raw RFC822, write one `.eml` per message named by Gmail message id:
```python
# backend/recall/jobs/gmail_dump.py  (operator-run; credentials supplied at runtime, never committed)
msgs = service.users().messages().list(userId="me",
        q="from:tldrnewsletter.com newer_than:2y").execute()
for m in msgs.get("messages", []):
    dest = Path(GMAIL_EXPORT_DIR) / f"{m['id']}.eml"
    if dest.exists():                      # rerun-safe: skip already-fetched
        continue
    raw = service.users().messages().get(userId="me", id=m["id"], format="raw").execute()
    dest.write_bytes(base64.urlsafe_b64decode(raw["raw"]))   # valid RFC822, real article hrefs
```
`format="raw"` returns the full message, so the `.eml` carries the real anchor `href`s (required for URL resolution, §6.4). **IMAP** (`imaplib`, search `FROM tldrnewsletter.com`, fetch `RFC822`) is the quickest variant if you would rather not set up an API project, at the cost of a Gmail app password. Mature CLI syncers (`mbsync`/`isync`, `getmail`) do the same thing cron-ably.

**Rerun semantics.** Re-running the dump is safe: files are keyed by Gmail message id, the exporter skips existing files, and the pipeline is idempotent on `source_ref`/`content_hash` (§6.1). So "rerun the `.eml`" never produces duplicates — it only adds new issues. Naming the file by message id also gives each `issue.source_ref` a stable value.

**Convergence with `GmailMCPSource`.** Both run the same `from:tldrnewsletter.com` query and hand RFC822 to the same parser; the only difference is who pulls the bytes. So `gmail_dump.py` is effectively the operator-run form of the eventual live MCP fetch, and the live path becomes a thin wrapper later.

**Operating note.** The OAuth/app-password step is run by you with your own credentials. The spec assumes the export job runs in your environment; the backend never stores Gmail credentials (see `.env.example`).

---

## 7. Embeddings — pluggable backend

### 7.1 Protocols (`embeddings/base.py`)
```python
class Embedder(Protocol):
    name: str            # 'voyage-3', 'qwen3-embedding-4b'
    dim: int
    def embed_documents(self, texts: list[str]) -> list[list[float]]: ...
    def embed_query(self, text: str) -> list[float]: ...

class Reranker(Protocol):
    name: str
    def rerank(self, query: str, candidates: list[Candidate], top_k: int) -> list[Candidate]: ...
    # Candidate carries content_id + the text used for reranking + a score slot.
```
A `factory.py` returns the configured implementations from env. **No other module imports a concrete backend.**

### 7.2 Default backend (`embeddings/cloud.py`)
- `CloudEmbedder`: calls a hosted embedding API (e.g. Voyage `voyage-3`/`voyage-3-lite`, or OpenAI `text-embedding-3-small`). Pick one in §13; spec assumes a 1024- or 1536-dim model and stores `dim` accordingly.
- `CloudReranker`: either a hosted rerank API (e.g. Cohere/Voyage rerank) **or** a no-op pass-through that preserves fusion order if no rerank key is set. Reranking must be optional and degrade gracefully.
- This backend keeps the Railway demo cheap and GPU-free.

### 7.3 Qwen backend (`embeddings/qwen.py`) — swappable
- `QwenEmbedder` (Qwen3-Embedding) + `QwenReranker` (Qwen3-Reranker-4B), with Qwen3 available for optional query rewriting/expansion.
- Two deployment modes documented (not both required for v1):
  - **Local (desktop):** models served by a local runtime (e.g. llama.cpp / Ollama / vLLM) the Electron app can talk to; enables offline/private search.
  - **Remote:** a separate GPU service exposing an OpenAI-compatible embeddings/rerank endpoint.
- Reference pipeline: pydantic-ai RAG example (https://pydantic.dev/docs/ai/examples/data-analytics/rag/) — follow its retrieval-then-generate shape if/when adding answer synthesis.
- v1 ships `QwenEmbedder`/`QwenReranker` as **working-but-optional** backends selected by config; CI/demo run on cloud.

### 7.4 What gets embedded ("a few dimensions")
For each piece of content, build text and embed multiple `kind`s:
- `title` — the title alone.
- `summary` — the TLDR blurb.
- `combined` — a **type-prefixed** composite so the content's nature lives in the vector space:
  ```
  "[{content_type}] {title} — {summary} (source: {domain}; tags: {tags})"
  e.g. "[repo] Headroom — Compresses everything an agent reads... (source: github.com; tags: agents, context)"
  ```
  The type prefix means a query like "github repos about agents" lands near repo items even before metadata filtering. Embedding the `domain`/tags adds lexical anchors that survive paraphrase.
- Primary retrieval uses `combined`; `title`/`summary` are available for weighting/experiments and for collection seeding. v1 may generate only `combined` to save cost, with `title`/`summary` behind a flag — but the schema supports all three.

### 7.5 Reindex / model-change migration
- `uv run recall embed-backfill` (re)embeds all content with the active model, writing rows tagged with `model`.
- Changing models: if new model `dim` == column dim, write new rows under the new `model` name and flip the active model in config (search filters embeddings by active `model`). If `dim` differs, add a migration introducing a parallel embedding table/column for that model. Document this explicitly.

---

## 8. Search — one unified hybrid box

**UX decision (deviation from the design file):** the prototype shows two icons — a magnifying-glass "search" and a spark "Ask your library". Per product direction, v1 **consolidates these into a single search surface**. One input accepts both keyword queries and plain-English questions; the engine decides how to satisfy them. Keep the spark/AI affordance visually (it signals semantic understanding) but route everything through one endpoint. The prototype's `runSearch` (lexical scoring in `prototype.jsx`) is replaced by the server-side hybrid pipeline below.

### 8.1 Pipeline (`search/service.py`)
```
query → 8.2 intent parse ──► filters (type, edition, read-state, starred, negations)
      → 8.3 lexical retrieve (Postgres FTS)           ─┐
      → 8.3 vector retrieve (pgvector, combined emb)  ─┤→ 8.4 RRF fusion → 8.5 rerank → 8.6 apply filters → page
```

### 8.2 Intent / type routing (`search/intent.py`)
A lightweight, deterministic-first classifier extracts structured filters from natural language so "blogs about X", "github repos involving agents", "substacks", "papers on retrieval", "tools for Y" route correctly:
- **Type lexicon → `content_type` filter:**
  - repo: "github", "repo(s)", "open source", "open-source"
  - substack: "substack(s)", "blog(s)", "newsletter(s)" *(treat "blog" as substack-leaning but soft — see below)*
  - paper: "paper(s)", "research", "arxiv", "study/studies"
  - website: "tool(s)", "site(s)", "product(s)", "app(s)"
  - article: default / "article(s)", "news"
- **Negation:** "non-agent", "not agents", "without X" → exclude terms (port the prototype's negation regex; the prototype already handled `non-?`, `not`, `without`).
- **State/meta:** "haven't read" / "unread" → `read_state=unread`; "saved"/"starred" → `starred=true`; edition names → edition filter.
- **Soft vs hard filters:** apply type as a **boost**, not a hard exclusion, unless the type word is unambiguous (e.g. explicit "github"). Rationale: avoid empty result sets when classification is fuzzy. Hard-filter only on high-confidence cues; otherwise add a ranking boost to matching types. **Implementation:** tag each lexicon entry **strong** (→ hard filter) or **weak** (→ soft boost); `RECALL_TYPE_FILTER_MODE=auto` (default) honors per-cue strength, while `soft`/`hard` globally override for tuning. The soft-boost weight (`RECALL_TYPE_BOOST_WEIGHT`) is configurable. Negation is always a hard exclude.
- Implementation: start rule/lexicon-based (fast, no model). Optionally upgrade to an LLM/Qwen3 classifier behind the same interface later. Strip recognized intent words from the text before semantic retrieval so they don't dilute the query embedding.

### 8.3 Retrieval
- **Lexical:** Postgres full-text search over `title`+`summary`+`tags`+`domain` (`tsvector` column with a GIN index; weight title highest). Returns top-K with `ts_rank`.
- **Vector:** embed the cleaned query via the active `Embedder`; pgvector cosine KNN over `content_embeddings` where `kind='combined'` and `model=<active>`. Returns top-K with distance.

### 8.4 Fusion (`search/fusion.py`)
Combine the two ranked lists with **Reciprocal Rank Fusion** (`score = Σ 1/(k + rank)`, k≈60). RRF is robust without score calibration between lexical and vector. Type-intent boosts are added here (small additive bonus to candidates whose `content_type` matches a detected soft type).

### 8.5 Rerank
Pass the fused top-N (e.g. 50) through the configured `Reranker` (cloud rerank, Qwen3-Reranker, or no-op) to produce the final ordering. Truncate to the requested page size.

### 8.6 Output
Return scored **content** joined with the requesting reader's save/read state, paginated. Because content is canonical (ADR-0001), results are inherently one row per story — no dedupe pass is needed. Include a lightweight `match_explanation` field per result for debugging (which path matched, detected filters) — useful while tuning, hidden in UI.

### 8.7 Smart collections
Each collection's `query` runs through this same pipeline at read time, capped to a count, to populate "IPO Watch", "Agent Tooling", etc. This is why collections store a natural-language `query` rather than a static member list in v1.

---

## 9. Backend API (FastAPI contract)

All responses are JSON; all list endpoints are paginated (`limit`, `offset`, return `{items, total, limit, offset}`). Pydantic schemas in `recall/schemas/` are the single source of truth and are mirrored in `frontend/src/types.ts`. Generate an OpenAPI doc (FastAPI gives `/docs` free) — this **is** the contract TLDR would implement against later.

```
GET  /health                                  → {status, db, embedder, version}

GET  /editions                                → [Edition]
GET  /issues?edition=&limit=&offset=          → paginated [IssueSummary]   (newest first)
GET  /issues/{id}                             → IssueDetail {issue, sections:[{category, content:[Content]}]}
GET  /issues/latest?edition=                  → IssueDetail               (Editorial landing)

GET  /content/{id}                            → Content (with reader save/read state)

GET  /library?density=&type=&edition=&category=&starred=&read_state=&limit=&offset=
                                              → paginated [Content]        (Library = whole corpus; filters mirror FilterPanel)

POST /search                                  → SearchResponse
     body: {q, filters?:{types[],editions[],categories[],starred?,read_state?}, limit?, offset?}
     resp: {items:[Content + score + match_explanation], total, detected:{types[],negations[],read_state?}}

GET  /collections                             → [Collection]
GET  /collections/{id}/items?limit=           → [Content]                  (resolves smart query live)

# per-reader state (stub user in v1)
PUT    /saves/{content_id}                     → State       (star/save)
DELETE /saves/{content_id}                     → 204         (unstar)
PATCH  /content/{content_id}/read              → {read_state} (mark read/unread)

# admin / ETL (guarded by stub auth or shared secret)
POST /admin/ingest        body:{since?, source?}  → {run_id}
GET  /admin/ingest/{run_id}                       → IngestRun
POST /admin/embed-backfill                         → {queued}
```

`Content` response shape (the canonical frontend object) — flat **primary-appearance** fields plus full provenance in `appearances[]` (usually length 1 on the seed set; carries "also in TLDR AI" once M4 ingests real issues):
```
{ id, title, summary, content_type, read_minutes, url, domain, tags, resources,
  edition:{key,name}, category:{slug,label,hue}, issue:{id,issue_number,published_at},   // primary appearance
  appearances:[ {issue:{id,issue_number,published_at}, edition:{key,name}, category:{slug,label,hue}, position} ],
  starred, read_state }
```

CORS: allow the web demo origin and the Electron origin (`file://`/custom scheme). Config-driven allowlist.

---

## 10. Frontend (port of the prototype)

### 10.1 Porting plan
The prototype is three artifacts: `data.js` (replaced by the API), `ui.jsx` (atoms: `Ico`, `Star`, `Logo`, `SrcBadge`, `SrcIcon`, `FaviconChip`, `ResourcePill`), and `prototype.jsx` (app + 3 views + filters + share). Port faithfully to **React + TypeScript + Vite**:
- Move `recall.css` to `frontend/src/styles/` unchanged (it already defines the full design system: palette, dark mode, chips, logo, fonts). Keep using CSS variables; do **not** rewrite styling into Tailwind — preserve the OKLCH design system as-is.
- Replace inline `window.RECALL` data access with the typed API client (`frontend/src/api/`).
- Replace `localStorage`-only persistence (`LS_KEY = 'recall-app-v1'`) with: UI prefs (dark mode, density, last edition) stay client-side; **saves/read-state move to the API**. Keep a localStorage cache for snappy optimistic toggles.
- Views: `EditorialView` (edition rail + masthead + category sections, from `/issues/latest` and `/issues`), `LibraryView` (compact/expanded density, infinite scroll, from `/library`), `SearchView` (single unified box, from `POST /search`).
- Keep `TopBar`, `FilterPanel`, `SharePop`, `Actions`, `ArticleItem` (port as `ContentItem`), `LibraryRow`, `SectionHead`, `IssueNav`. Consolidate the two search icons into one per §8. In `FilterPanel`, rename the "Source" group to **"Type"** (dimension `sources`→`types`) to match `content_type` and the API. Replace the hardcoded "1,204 saved" header with a **live Library count** (total content; "· N match filters" when filtered).
- Issue navigation (`IssueNav` prev/next) becomes real: page through `/issues`.

### 10.2 State / data
- Use a small data layer (TanStack Query recommended) for fetching/caching/pagination and optimistic save toggles. Keep app/view state in React context as the prototype does (`AppCtx`).

### 10.3 Platform shim (`frontend/src/platform/`)
The one place that differs between web and desktop. Exposes:
```ts
interface Platform {
  openExternal(url: string): void;   // article links
  isDesktop: boolean;
}
```
- `electron.ts`: calls preload-bridged IPC → opens the in-app browser (§ below).
- `web.ts`: opens a new browser tab (`window.open`) — or an in-app overlay that `iframe`s the URL where the site permits framing, with graceful fallback to new-tab when `X-Frame-Options`/CSP blocks it. Default web behavior: new tab (reliable). The in-app back-button experience is the **desktop** differentiator.
- `index.ts`: selects impl by detecting the Electron preload bridge.

### 10.4 In-app browser (Electron) — back-button requirement
Implemented in `desktop/src/browser.ts` using a **`WebContentsView`** (current Electron API; `BrowserView` is deprecated) layered over the renderer, OR a dedicated child route that hosts a `<webview>`-style container. Required behavior:
- Clicking an article calls `platform.openExternal(url)` → IPC → main process shows the in-app browser view bound to the window, navigates to `url`.
- A slim chrome bar overlays the top with: **Back** (returns to Recall — hides the browser view and restores the reader at the prior scroll position), reload, the current URL/domain, "open in system browser", and forward/back **within** the visited site (`webContents.goBack()/goForward()`).
- Security: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, a `preload` that exposes only the minimal IPC surface via `contextBridge`. External content runs in its own `WebContentsView` with no Node access. Validate/normalize URLs before navigation; block `file://` and non-http(s) schemes from article links.
- The back button restoring the newsletter is the core "stay in the app" UX the spec calls for.

### 10.5 Web demo specifics
- Same React build, `VITE_API_BASE_URL` pointing at the Railway API.
- Article links open in a new tab (§10.3). Show a subtle note that the in-app reader is a desktop feature.
- Ship a seeded DB so the founder sees a populated library + working search immediately.

---

## 11. Auth — stubbed (leave alone, but interface-clean)

- `auth/base.py`: `AuthProvider` with `current_user(request) -> User`.
- `auth/stub.py`: returns a single seeded user; no login UI. The TopBar "user" icon opens a placeholder "Account & admin" panel (non-functional stub, as in the prototype).
- All per-user queries (`saves`, `read_state`) already key off `user_id`, so dropping in real auth (OAuth/JWT) later is an interface swap with no schema change.
- Admin/ingest endpoints guarded by a shared-secret header in v1 (`RECALL_ADMIN_TOKEN`), independent of user auth.

### 11.4 Backend location for desktop
Two documented options; pick one in §13:
- **(A) Desktop talks to the hosted Railway API** (simplest; requires connectivity; same data as web demo). Recommended for v1 so desktop and demo share one DB.
- **(B) Desktop bundles/spawns a local backend** (`desktop/src/backend.ts` launches the FastAPI/uv app or a packaged binary, points at a local or remote DB). Needed only for offline/local-Qwen mode; defer to v2.

---

## 12. Packaging, deployment, config

### 12.1 Desktop packaging
- **electron-builder** (`desktop/electron-builder.yml`) producing macOS `.dmg` (primary — Matt is on macOS) and Windows `.exe` (NSIS) so the founder can run it on either.
- Build flow: `vite build` frontend → copy `dist/` into desktop resources → `electron-builder`.
- Code signing / notarization: document the macOS notarization + Windows signing steps and required secrets; gate them so unsigned local dev builds still work. Provide an unsigned build path for quick demos.
- `npm run dist` (in `desktop/`) is the one-command installer build. Auto-update is out of scope for v1 (note it as a later add via electron-updater).

### 12.2 Web + API on Railway (all-in-one project)
- **Postgres + pgvector** service (already provisioned). Run `CREATE EXTENSION IF NOT EXISTS vector;` via migration.
- **API service**: `backend/Dockerfile`, `uvicorn recall.main:app`, reads `DATABASE_URL` + keys from Railway env. Runs Alembic migrations on deploy.
- **Web service**: static build of `frontend/` served by a tiny static server (or Railway static), `VITE_API_BASE_URL` → API service URL.
- **Ingest**: scheduled job or manual trigger of `/admin/ingest`.
- `infra/railway.json` declares services; `infra/notes.md` documents provisioning + the GitHub-connected deploy.

### 12.3 Configuration (`.env.example`)
```
# Database
DATABASE_URL=postgres://...                 # Railway

# Embeddings / rerank (pluggable) — v1 locked to OpenAI text-embedding-3-small
RECALL_EMBED_BACKEND=cloud                   # cloud | qwen
RECALL_EMBED_MODEL=text-embedding-3-small    # swap: voyage-3-lite (1024-dim, needs §7.5 migration)
RECALL_EMBED_DIM=1536
EMBEDDING_API_KEY=...
RECALL_RERANK_BACKEND=none                   # off for v1; none | cloud | qwen
RERANK_API_KEY=
QWEN_ENDPOINT=                               # when backend=qwen (OpenAI-compatible URL)

# Ingestion (temporary ETL) — v1 locked to offline export folder
RECALL_INGEST_SOURCE=gmail_export            # gmail_export | gmail | tldr_rest
GMAIL_EXPORT_DIR=./samples                   # .eml/.html files; populated by recall.jobs.gmail_dump (§6.8)
# (Export job runs with your own Gmail creds; backend stores no Gmail credentials)

# Search tuning
RECALL_SEARCH_RRF_K=60
RECALL_TYPE_FILTER_MODE=auto                 # auto (per-cue strength, default) | soft | hard (global override)
RECALL_TYPE_BOOST_WEIGHT=0.1                 # additive RRF bonus for soft type matches (tunable)

# Auth / admin
RECALL_ADMIN_TOKEN=...

# Product analytics (PostHog) — optional, no-op when unset (§12.4)
RECALL_ANALYTICS_ENABLED=false
VITE_POSTHOG_KEY=                            # client-side (posthog-js)
POSTHOG_KEY=                                 # optional server-side events
POSTHOG_HOST=https://us.i.posthog.com        # or https://eu.i.posthog.com

# Frontend
VITE_API_BASE_URL=https://<railway-api-url>
```

Secrets live in Railway env / local `.env` (gitignored). **Never** commit keys. The spec's stub-auth and admin token are not a substitute for real auth in a multi-user future.

### 12.4 Product analytics (PostHog) — optional, off by default

**Why it's in scope.** TLDR today sees only coarse email metrics (opens/clicks), which degrade as mail clients prefetch and mask opens. A first-party reader produces true engagement signal: what gets saved, which links actually open and for how long, and above all **what readers search for** — direct demand and editorial intelligence the current stack cannot surface. Instrumenting Recall with PostHog demonstrates that capability to the founder and is a real part of the adoption pitch. If TLDR already runs PostHog, point the app at their project for continuity; otherwise it showcases a new capability.

**Seam.** Treat analytics like the other pluggable backends: an `Analytics` interface (`frontend/src/analytics/` client-side; optional `recall/analytics.py` server-side) with a PostHog implementation and a **no-op default** selected when no key is set (same pattern as rerank). No view or service imports a vendor SDK directly. This keeps it trivially repointable to TLDR's own project and removable for a clean handoff.

**Where it runs.** Client-side `posthog-js` captures the product events (it owns the interactions). Optional server-side `posthog` (python) for ingestion/admin events (issues ingested, embed runs). Client-first for v1. Instrument lightly during M2/M3; it is additive and does not gate those milestones.

**Event taxonomy (define once, typed):**

| event | key properties |
|---|---|
| `app_open` | platform (desktop/web), edition |
| `issue_view` | edition, issue_number |
| `article_open` | content_id, content_type, domain, edition, category, source_view |
| `article_close` | content_id, dwell_ms (in-app browser open→back; desktop bonus) |
| `search_performed` | query, result_count, detected_types[], had_results |
| `result_open` | content_id, rank, query |
| `save_toggled` | content_id, content_type, state(on/off) |
| `read_toggled` | content_id, state |
| `collection_view` | collection slug |

The `search_performed` + `result_open` pair is the highest-value signal (intent plus what satisfied it). In-app `dwell_ms` is a desktop-only extra the web demo cannot match.

**Hosting.** PostHog Cloud free tier for the demo (no infra). Self-host or TLDR's own project later via config swap. Do not stand up a PostHog instance on Railway for v1; it is heavy and unnecessary.

**Privacy (required).** Anonymous device id; no PII in event properties; never put query text or emails in URLs. Honor Do-Not-Track. The web demo shows a consent banner defaulting to decline non-essential; the desktop app exposes an on-by-default toggle with disclosure. Search query text is valuable but is user content — capturing it is fine for the single-user demo, but a multiuser product must aggregate/anonymize queries rather than store raw per-user text. Document this in the README.

---

## 13. Decisions — resolved at kickoff

These are locked for v1. Build to them.
1. **Cloud embedding provider — RESOLVED: OpenAI `text-embedding-3-small` (1536-dim).** Set `RECALL_EMBED_MODEL=text-embedding-3-small`, `RECALL_EMBED_DIM=1536`. `voyage-3-lite` is the pre-approved swap behind the `Embedder` interface if cost or quality warrants; switching is a config + `embed-backfill` (its 1024-dim needs the §7.5 dimension migration).
2. **Rerank — RESOLVED: off for v1.** `RECALL_RERANK_BACKEND=none`. Turn on cloud rerank only if seed/live queries return visibly bad ordering.
3. **Desktop backend — RESOLVED: option (A).** Desktop talks to the hosted Railway API so desktop and the founder's web link share one living dataset. Option (B) deferred to v2.
4. **Gmail access — RESOLVED: `gmail_export` offline source first.** v1 ingests from `GMAIL_EXPORT_DIR` populated by the export job (§6.8); the `.eml` dump is rerunnable and idempotent. Live `GmailMCPSource` is a later thin wrapper. Confirm exact TLDR sender addresses while building the parser (sample shows `dan@tldrnewsletter.com`).
5. **`editor_note` ("why saved") — RESOLVED: keep nullable, unused** until there is a generator.

---

## 14. Build milestones (suggested order for Claude Code)

**Confirmed handoff scope.** This work ships in two chunks. **Chunk 1 = M0–M3** is the first Claude Code engagement and the subject of kickoff: scaffold, schema + seed, frontend port, and embeddings + search — a real, clickable app with working hybrid search on seeded data, no ingestion or packaging yet. **Chunk 2 = M4–M6** (live export-based ingestion, in-app browser, Railway demo) is planned and handed off separately once Chunk 1 looks right. M7 (Qwen) stays optional. One early parallel task outside the milestone chain: stand up the §6.8 export job so a real `.eml` corpus is accumulating on disk before M4 needs it.

**M0 — Scaffold.** Monorepo per §4. `uv` backend project, Vite+TS frontend, Electron shell, docker-compose Postgres+pgvector, `.env.example`, CI lint/test. Health endpoint green.

**M1 — Data + seed.** Alembic migrations for §5 schema (content / content_appearances / content_embeddings / user_content_state); pgvector extension + HNSW index. Convert `data.js` → JSON fixture; `seed.py` populates editions/categories/issues/content/appearances/user_content_state/collections (category hue copied verbatim from `data.js`). `GET /editions`, `/issues`, `/issues/latest`, `/issues/{id}`, `/library`, `/content/{id}` working against seed data.

**M2 — Frontend port (against seeded API).** Port `recall.css`, atoms, three views, filters, share, dark mode. Wire to the API. Saves/read-state via API with optimistic UI. This makes the prototype "real" before any ML or ingestion.

**M3 — Embeddings + search.** `Embedder`/`Reranker` protocols + cloud backend + factory. `embed-backfill` over seed data. Postgres FTS + pgvector retrieval + RRF fusion + intent routing. `POST /search`. Replace the prototype's client-side search with the unified box. Tune with the seed set ("github repos about agents", "anthropic ipo", "unread substacks").

**M4 — Ingestion ETL.** `IngestionSource` + DTOs. Build `GmailExportSource` (offline `.eml`/HTML folder) + `parser.py` + `classify.py` + URL resolution first (testable on the sample emails), then `GmailMCPSource`. `pipeline.py`, `/admin/ingest`, `ingest_runs`. Re-ingest is idempotent. Real issues replace seed.

**M5 — In-app browser + platform shim.** Electron `WebContentsView` browser with back button + security hardening; web fallback to new tab. Article clicks route through `platform.openExternal`.

**M6 — Packaging + Railway demo.** electron-builder installers (mac + win); deploy API + web + Postgres to Railway; seed/ingest the hosted DB; verify the shareable URL. Document install + demo steps in README.

**M7 — Qwen backend (optional, time-permitting).** Implement `QwenEmbedder`/`QwenReranker` behind the existing protocols; document local + remote modes. Not required for the founder demo.

Each milestone is independently demoable. M0–M3 already yield a working app on seed data; M4 makes it live; M5–M6 make it shippable.

---

## 15. Testing & quality gates

- **Parser tests** (highest value): golden-file tests turning the sample TLDR emails (and the `tldr-web/uploads` PDFs as fallback fixtures) into expected `RawIssue` JSON. Cover sponsor-skipping, missing read-time, multi-paragraph summaries, unknown sections, emoji headers.
- **Classification tests:** domain → `content_type` table; intent parser → detected filters (incl. negation, "unread", edition names).
- **Search tests:** on the seed set, assert ordering invariants (type-routed queries surface the right `content_type`; negation excludes; FTS+vector both contribute) rather than brittle exact ranks.
- **API contract tests:** schema round-trips; pagination; save/read state per user.
- **Idempotency test:** re-running ingestion produces no duplicate content (global `content_hash`) and no duplicate appearances (`unique(issue_id, content_id)`).
- **Migration test:** fresh DB → migrate → seed → query.
- **Frontend:** component smoke tests + a visual check against `tldr-web/shot.png` for the Editorial view; manual QA checklist for dark mode, density toggle, infinite scroll, in-app back button.

---

## 16. Risks & notes

- **URL resolution reliability:** TLDR redirect links may rate-limit or change format. Cache aggressively; degrade to raw URL + parsed domain on failure. Never block serving on it.
- **Gmail MCP at server runtime:** the MCP is an agent/runtime tool, not a server SDK. The `.eml`/export-folder source is the dependable v1 path; live MCP fetch is operator-driven. Build the offline path first.
- **Embedding dimension lock-in:** the pgvector column dimension is fixed per model; switching models with a different dim needs a migration (§7.5). Choose the v1 model deliberately.
- **`X-Frame-Options` on the web demo:** many article sites refuse iframing, so the web "in-app" overlay must fall back to new-tab. The true in-app reader is the desktop differentiator — set expectations in the demo.
- **Sponsor/ad filtering:** mis-classifying an ad as an article pollutes the library and search. Keep the skip-heuristics conservative and tested.
- **Scope discipline:** auth, multi-user, mobile, answer-synthesis/chat, and auto-update are explicitly deferred. The interfaces (`AuthProvider`, `IngestionSource`, `Embedder`, `Analytics`) are the hooks that make those later additions cheap.
- **Analytics privacy:** product analytics (§12.4) is off unless keyed. When on, capture anonymously with no PII, show a decline-by-default consent banner on the web demo, and honor Do-Not-Track. Raw per-user search text is acceptable for the single-user demo but must be aggregated/anonymized in any multiuser future.

---

## 17. Appendix A — design system quick reference (from `recall.css`)

- **Type:** Schibsted Grotesk (UI/editorial), JetBrains Mono (metadata/labels).
- **Light palette:** warm paper `oklch(0.985 0.004 95)`, ink `oklch(0.24 0.012 70)`, TLDR blue accent `oklch(0.55 0.17 256)`, amber star `oklch(0.76 0.145 76)`.
- **Dark palette:** defined under `.rc.dark` (same system inverted).
- **Category hues:** `--c-bigtech/science/prog/ai/deep/tools/strategy/misc` (equal L/C, hue varies) — store `hue` var name per category row (§5.2).
- **Components already styled:** `.rc-logo`, `.rc-src` (type chip), `.rc-cat`/`.rc-dot`, `.rc-star`, `.rc-chip`, `.rc-btn`, spinner. Reuse verbatim.

## 18. Appendix B — content-type signals (classification cheat sheet)

| content_type | Strong domain/label signals |
|---|---|
| repo | `github.com`, `gitlab.com`, "(GitHub Repo)", resource pill `k:'repo'` |
| substack | `*.substack.com`, known blog domains, "blog"/"newsletter" wording |
| paper | `arxiv.org`, `*/research`, journal domains, `.pdf`, "(paper)", resource `k:'paper'` |
| website | bare product/tool homepage (no article path), "(tool)"/"(site)" |
| article | default — news/editorial domains (theverge.com, nytimes.com, reuters.com, …) |

## 19. Appendix C — reference inputs in this repo
- `tldr-web/Recall.html`, `prototype.jsx`, `ui.jsx`, `recall.css`, `data.js` — the interaction + visual + data reference.
- `tldr-web/shot.png` — rendered Editorial view (visual target).
- `tldr-web/uploads/*.pdf` — three real TLDR issues (TLDR, TLDR AI, TLDR Founders) as parser fixtures.
- Variant explorations (`home-variants.jsx`, `search-variants.jsx`, `card-variants.jsx`, `editorial-dark.jsx`, `design-canvas.jsx`) — optional design alternates; not required for v1.

---



*End of specification.*
