# Canonical content with per-issue appearances

## Context

TLDR runs the same link in multiple editions on the same day and recurs stories across days. The prototype (`data.js`) models every item as belonging to exactly one edition, and the original spec gave each `articles` row a single `issue_id` — so the same link in two issues would become two rows. That conflicts with the product's core promise ("search across history"): a story would appear multiple times in results, get embedded multiple times, and carry ambiguous read/save state.

## Decision

A piece of **content** is a *canonical link*, deduplicated globally by `content_hash` (the hash of its normalized resolved URL). Each time that link shows up in an issue is an **appearance** — a separate row recording `(content_id, issue_id, category_id, position)`. An issue is rendered by reading through its appearances. The editorial text (`title`, `summary`, `read_minutes`, `tags`, `resources`) is denormalized onto `content` on a **first-seen-wins** basis; only `category` and `position` — which genuinely vary across editions — live on the appearance.

Embeddings (`content_embeddings`) and per-reader state (`user_content_state`: starred, read_state) both key off `content_id`, so each story is embedded once and saving/reading it once applies no matter which edition it was seen in.

## Considered Options

- **Issue-scoped content (rejected).** One row per (issue, link); de-duplicate only at search time. Simpler schema, matches the prototype, but pushes a permanent collapse step onto every read path and makes read/save state per-sighting. Cheaper now, more fragile as the corpus grows.
- **Text on the appearance (rejected for v1).** Most faithful to TLDR's per-edition blurbs, but forces a "primary appearance" choice for embedding and display plus an extra join everywhere, for differences that are cosmetic in a reader app. Promoting text to the appearance later is a clean additive migration if it ever earns its keep.

## Consequences

- The Editorial view renders an issue *through* its appearances; `edition` and `category` filters mean "has an appearance in X" (a story can sit in different categories across editions).
- The Library and search results display a **primary appearance** for each Content. Primary = the **globally-earliest** appearance (by `published_at`, then `position`) and is a **stable** property of the Content — it does not change with the active view. The `edition`/`category` filters are pure **has-appearance-in membership**: they decide whether a Content is *included*, never which appearance is *shown*. So a Content surfaced by `edition=ai` may still display its earliest (e.g. TLDR) appearance, with the AI sighting carried in `appearances[]`. (Two deferred follow-ups this enables but does not yet build: surfacing multiple editions on one Library row — e.g. "TLDR · AI"; and lens-relative presentation, where the shown appearance follows the active filter. Both wait for M4, since the seed has no multi-appearance content to exercise them.)
- The `Content` API response is **flat + `appearances[]`**: primary-appearance `edition`/`category`/`issue` at top level for convenience, plus an `appearances[]` array carrying full provenance. This keeps the published OpenAPI contract honest about the model and avoids a breaking response-shape change once M4 produces multi-appearance content.
- **Library filter combination:** dimensions AND together; values within a dimension OR (multi-select). `edition`/`category` match on *any* of a Content's appearances (has-appearance-in, above); `type` (`content_type`) and `starred` are Content-level. (Read/unread is **not** a Content filter — it is per-Issue; see ADR-0002.)
- `content_hash` is computed post-URL-resolution (M4); it falls back to `hash(raw_url)` when resolution fails. The seed set has no duplicates, so the hash is synthesized per item.
