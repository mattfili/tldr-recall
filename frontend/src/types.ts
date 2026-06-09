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

/** GET /editions returns a plain list of EditionRef (schemas/edition.py). */
export type Edition = EditionRef;

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
