# Recall

A reading, saving, and semantic-search client for the TLDR family of newsletters. It ingests TLDR issues, lets a reader browse and search their accumulated history by meaning, and bookmark what they want to return to.

## Language

**Library**:
The entire accumulated corpus of ingested Content — everything TLDR has sent, browsable and fully searchable. The Library is *not* the set of bookmarked Content.
_Avoid_: Saved items (as a synonym for Library), inbox

**Save** (verb) / **Star**:
Bookmarking a piece of Content so you can return to it. A flag on top of the Library, surfaced as the "Starred only" filter — not membership in the Library. "Save" and "Star" are the same action in v1.
_Avoid_: Favorite, pin, collect

**Search scope**:
Search always ranges over the whole Library (all ingested Content), never only the bookmarked subset. "Search across history" is the core capability.

**Read state**:
Whether a reader has been through an **Issue** (read / unread) — a per-reader, per-Issue fact, surfaced on the edition rail and issue nav (e.g. to catch up on missed Issues). It is **not** a property of Content: individual articles carry no read/unread state.
_Avoid_: per-article read, marking articles read, Seen

**Engagement**:
Behavioral signals on a piece of Content — opening it (clicking through to the source) or sharing it. Captured for **analytics only** (PostHog) to inform editorial/business decisions; never a user-facing state, and nothing the reader toggles or filters on. The article-level counterpart to the (Issue-level) Read state.
_Avoid_: read / opened (as a Content property)

**Content**:
The core unit (the genus) — a *canonical* summarized link, deduplicated globally by `content_hash`. A piece of Content may be a news piece, a repo, a paper, a substack, or a website; which one is its **content type**. The same link running in several editions is one Content with several appearances. The Library is the collection of all Content. See [ADR-0001](docs/adr/0001-canonical-content-with-appearances.md).
_Avoid_: Article (as the genus — "article" is only a content-type value), Item, Entry, Post

**Content type**:
What kind of thing a piece of Content is: `article` | `repo` | `website` | `substack` | `paper`. "Article" here means specifically a news/editorial piece, never the generic unit.
_Avoid_: Source, src, kind (when referring to content type)

**Appearance**:
A single sighting of a piece of Content in an issue — records which issue, which category it was filed under, and its position. An issue is made of appearances. Category and position live on the appearance because they vary across editions; the editorial text lives on the Content.
_Avoid_: Occurrence, instance, mention

**Primary appearance**:
The appearance chosen to represent a piece of Content when it is shown outside a single issue (Library rows, search results) — the earliest by default. Other appearances are available as provenance.

**Edition**:
A TLDR sub-brand — TLDR, TLDR AI, TLDR Founders, etc. Editions are extensible (stored, not enumerated).
_Avoid_: Newsletter (ambiguous), publication

**Issue**:
One dated edition of a newsletter (e.g. TLDR AI for Jun 2 2026, #1487). A set of appearances grouped into themed sections.
_Avoid_: Email, edition (an issue is *of* an edition), newsletter

**Sponsor block**:
An advertisement in an issue — the "Together With" masthead slot or an item suffixed "(Sponsor)". Sponsor blocks are **not Content**: ingestion skips them entirely, so they never enter the Library, search, or embeddings.
_Avoid_: sponsored article, ad content

**Ingestion source**:
Where issues are fetched from before parsing — a Gmail export folder, the live Gmail MCP, or a future first-party TLDR REST feed, behind the `IngestionSource` interface. This is the *only* thing "source" refers to; never use "source" for an item's content type.
_Avoid_: Source (bare, when content type is meant)
