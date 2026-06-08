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
 * The canonical frontend object (spec §9, ADR-0001; schemas/common.py Content).
 *
 * Flat PRIMARY-APPEARANCE fields (edition/category/issue) + full provenance in
 * appearances[] + per-reader starred/read_state.
 *
 * Contract notes:
 *  - `content_type` / `read_state` are plain strings.
 *  - `read_minutes` is int | null.
 *  - `resources` is list | null (null when absent, NOT []).
 *  - `tags` is always a list (never null).
 *  - `category` CAN be null (seed never produces null, but the type allows it).
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

  // per-reader state (stub user)
  starred: boolean;
  read_state: string;
}

/** The universal pagination envelope (schemas/common.py Page[T]). */
export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

/** One issue in the paginated GET /issues list (schemas/issue.py IssueSummary). */
export interface IssueSummary {
  id: string;
  edition: EditionRef;
  issue_number: string | null;
  published_at: string;
  subject: string | null;
  subtitle: string | null;
  content_count: number;
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
