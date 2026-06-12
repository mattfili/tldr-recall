// Shared TS types mirroring the FastAPI contract (backend/recall/schemas/, ADR-0001).
// These mirror the pydantic v2 schemas EXACTLY — field names and nesting here ARE
// the contract. Stage 1 verified these against the live seeded DB.

/**
 * GET /health response.
 *
 * `db` is "ok" when the backend's SELECT 1 succeeds, otherwise an
 * "error: <msg>" string. `embedder` is the configured embed model name
 * (e.g. "text-embedding-3-small") or "unconfigured".
 */
export interface Health {
  status: "ok";
  db: string;
  embedder: string;
  version: string;
}

/** `{key, name}` — an edition reference (schemas/common.py EditionRef). */
export interface EditionRef {
  key: string;
  name: string;
}

/**
 * One edition in GET /editions (schemas/edition.py): the ref + the current reader's
 * unread-issue count (#19, ADR-0002 — an issue is unread when the reader has no
 * user_issue_state row for it or the row says "unread"). Drives the rail unread dots.
 */
export interface Edition extends EditionRef {
  unread_count: number;
  /** Whether the edition's NEWEST issue is unread — the rail dot keys off this (#49). */
  latest_unread: boolean;
}

/**
 * `{slug, label, hue}` — a category reference (schemas/common.py CategoryRef).
 * `hue` is the stored CSS-var value verbatim, e.g. "var(--c-bigtech)".
 * NOTE: category CAN be null on Content / Appearance, so callers must guard.
 */
export interface CategoryRef {
  slug: string;
  label: string;
  hue: string;
}

/**
 * `{id, issue_number, published_at}` — slim issue reference inside Content
 * (schemas/common.py IssueRef). `issue_number` is a string like "#3120" and
 * CAN be null. `published_at` is a date string "YYYY-MM-DD".
 */
export interface IssueRef {
  id: string;
  issue_number: string | null;
  published_at: string;
}

/** One sighting of a Content in an issue (schemas/common.py Appearance). */
export interface Appearance {
  issue: IssueRef;
  edition: EditionRef;
  category: CategoryRef | null;
  position: number;
}

/** A resource pill extracted from a Content (resources[] dict shape). */
export interface Resource {
  k: string;
  label: string;
  meta?: string;
}

/**
 * The canonical frontend object (spec §9, ADR-0001/0002; schemas/common.py Content).
 *
 * Flat PRIMARY-APPEARANCE fields (edition/category/issue) + full provenance in
 * appearances[] + the per-reader `starred` (Save/Star) flag.
 *
 * Contract notes:
 *  - `content_type` is a plain string.
 *  - `read_minutes` is int | null.
 *  - `resources` is list | null (null when absent, NOT []).
 *  - `tags` is always a list (never null).
 *  - `category` CAN be null (seed never produces null, but the type allows it).
 *  - Content has NO read state — read/unread is a per-(reader, ISSUE) fact (ADR-0002,
 *    see IssueSummary.read_state).
 */
export interface Content {
  id: string;
  title: string;
  summary: string;
  content_type: string;
  read_minutes: number | null;
  url: string;
  domain: string;
  tags: string[];
  resources: Resource[] | null;

  // primary appearance (flattened for convenience)
  edition: EditionRef;
  category: CategoryRef | null;
  issue: IssueRef;

  // full provenance
  appearances: Appearance[];

  // per-reader state (stub user) — Save/Star only (ADR-0002).
  starred: boolean;
}

/** The universal pagination envelope (schemas/common.py Page[T]). */
export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * One issue in the paginated GET /issues list (schemas/issue.py IssueSummary).
 *
 * `read_state` is the stub reader's per-(reader, ISSUE) read/unread state (ADR-0002),
 * defaulting to "unread" when never viewed; drives the catch-up unread markers.
 */
export interface IssueSummary {
  id: string;
  edition: EditionRef;
  issue_number: string | null;
  published_at: string;
  subject: string | null;
  subtitle: string | null;
  content_count: number;
  read_state: string;
}

/** The issue object embedded at the top of IssueDetail (schemas/issue.py IssueMeta). */
export interface IssueMeta {
  id: string;
  edition: EditionRef;
  issue_number: string | null;
  published_at: string;
  subject: string | null;
  subtitle: string | null;
}

/** One category section within an issue (schemas/issue.py IssueSection). */
export interface IssueSection {
  category: CategoryRef;
  content: Content[];
}

/** The full issue detail (schemas/issue.py IssueDetail). */
export interface IssueDetail {
  issue: IssueMeta;
  sections: IssueSection[];
}

/**
 * The full per-reader Save/Star state for one Content (schemas/saves.py SaveState).
 * Returned by PUT/DELETE /saves/{content_id} — the shape the optimistic flip reconciles against.
 */
export interface SaveState {
  content_id: string;
  starred: boolean;
}

/**
 * The reader's per-Issue read state (schemas/issue.py IssueReadState).
 * Returned by PUT /issues/{issue_id}/read.
 */
export interface IssueReadState {
  issue_id: string;
  read_state: string;
}

// ── unified hybrid search (#7, schemas/search.py; spec §8, ADR-0001/0002/0003) ──
//
// Mirror the pydantic search schemas VERBATIM. There is NO read_state anywhere (ADR-0002 —
// the read cue was removed from the content intent lexicon).

/** Explicit UI filters, ANDed with the intent the backend detects from the query text. */
export interface SearchFilters {
  types: string[];
  editions: string[];
  categories: string[];
  starred: boolean;
}

/** POST /search body: a free-text query over the WHOLE Library + optional explicit filters. */
export interface SearchRequest {
  query: string;
  limit?: number;
  offset?: number;
  filters?: SearchFilters;
}

/**
 * HIDDEN per-hit provenance (schemas/search.py MatchExplanation). Response-only — NOT rendered
 * in the UI. `matched_via` lists contributing signals ("lexical" | "vector" | "type_boost");
 * `degraded` is true when the vector arm was skipped (ADR-0003 graceful degradation).
 */
export interface MatchExplanation {
  matched_via: string[];
  lexical_rank?: number | null;
  vector_rank?: number | null;
  fused_score: number;
  type_boost?: number | null;
  degraded?: boolean | null;
}

/**
 * One search result (schemas/search.py SearchHit): the full Content shape + a relevance `score`
 * + a HIDDEN `match_explanation`. SearchHit is a Content SUPERSET, so <ContentItem it={hit} />
 * renders it unchanged.
 */
export interface SearchHit extends Content {
  score: number;
  match_explanation: MatchExplanation;
}

/** What the parser read from the query text (schemas/search.py DetectedIntent). NO read_state. */
export interface DetectedIntent {
  types: string[];
  negations: string[];
}

/** Page-like search envelope (schemas/search.py SearchResponse). */
export interface SearchResponse {
  items: SearchHit[];
  total: number;
  limit: number;
  offset: number;
  detected: DetectedIntent;
}

/** A smart collection (schemas/search.py CollectionRef); resolved LIVE through the pipeline. */
export interface CollectionRef {
  slug: string;
  label: string;
  query: string;
  hue: string;
}

// ── client-only state (NOT wire shapes) ──
//
// The wire types above mirror schemas/common.py verbatim. GET /library returns
// Page<Content> and GET /categories returns CategoryRef[] — both already exist
// above, so #4 adds NO new response shape. The type below is purely client-side
// Library filter state, shared between App / FilterPanel / LibraryView.

/**
 * Library filter state (ADR-0001 — dimensions AND together, values within OR).
 *  - `types`      -> content_type values ("article" | "repo" | "paper" | …).
 *  - `editions`   -> edition keys (has-appearance-in).
 *  - `categories` -> category slugs (has-appearance-in).
 *  - `starredOnly`-> the stub user's starred Content.
 * Density is NOT here — it is a presentation pref (usePrefs/localStorage), not a filter.
 */
export interface LibraryFilters {
  types: string[];
  editions: string[];
  categories: string[];
  starredOnly: boolean;
}
