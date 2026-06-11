// Typed analytics event taxonomy (spec §12.4 — "define once, typed"; issue #24).
// Exactly the four highest-value events (grilled 2026-06-10). "Engagement" here is
// analytics-only by definition (CONTEXT.md, ADR-0002) — nothing in this module ever
// feeds user-facing state.
//
// Privacy contract (spec §12.4): properties carry NO PII — content ids, types, domains,
// edition/category keys, and (for the single-user demo) raw query text only.

/** Which surface an article was opened from. */
export type SourceView = "editorial" | "library" | "search";

/**
 * The four events and their exact property shapes. A `type` (not `interface`) so each
 * payload is assignable to `Record<string, unknown>` at the sink boundary.
 */
export type AnalyticsEvents = {
  /** A search ran and its first page of results came back. */
  search_performed: {
    query: string;
    result_count: number;
    detected_types: string[];
    had_results: boolean;
  };
  /** A search result was clicked. `rank` is the 0-based position in the results list. */
  result_open: {
    content_id: string;
    rank: number;
    query: string;
  };
  /** An article link was opened (any surface). edition/category are the PRIMARY appearance's. */
  article_open: {
    content_id: string;
    content_type: string;
    domain: string;
    edition: string;
    category: string | null;
    source_view: SourceView;
  };
  /** The Save/Star was toggled. */
  save_toggled: {
    content_id: string;
    content_type: string;
    state: "on" | "off";
  };
};

export type AnalyticsEventName = keyof AnalyticsEvents;

/** The typed seam every call site programs against (never a vendor SDK). */
export interface Analytics {
  capture<E extends AnalyticsEventName>(event: E, props: AnalyticsEvents[E]): void;
}

/**
 * The untyped transport implementations provide (no-op, buffering, posthog). The typed
 * `Analytics` facade narrows on top of this; implementations only need name + bag.
 */
export interface AnalyticsSink {
  capture(event: AnalyticsEventName, props: Record<string, unknown>): void;
}
