// TanStack Query hooks over the typed API client. This sets up the data layer
// that #4 (Library) and #5 (writes) build on. Queries are read-only in #3.

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  getCategories,
  getContent,
  getEditions,
  getIssue,
  getIssues,
  getLatestIssue,
  getLibrary,
} from "./client";
import type { LibraryFilters } from "../types";

export const queryKeys = {
  editions: ["editions"] as const,
  categories: ["categories"] as const,
  issues: (edition?: string) => ["issues", { edition: edition ?? null }] as const,
  issue: (id: string) => ["issue", id] as const,
  latestIssue: (edition?: string) => ["issue", "latest", { edition: edition ?? null }] as const,
  content: (id: string) => ["content", id] as const,
  library: (filters: LibraryFilters) => ["library", filters] as const,
};

/** GET /editions. */
export function useEditions() {
  return useQuery({ queryKey: queryKeys.editions, queryFn: getEditions });
}

/** GET /issues?edition= — the paginated, newest-first issue list (drives IssueNav). */
export function useIssues(edition?: string) {
  return useQuery({
    queryKey: queryKeys.issues(edition),
    queryFn: () => getIssues({ edition, limit: 50 }),
  });
}

/** GET /issues/{id} — full issue detail; enabled only when an id is known. */
export function useIssue(id: string | null) {
  return useQuery({
    queryKey: queryKeys.issue(id ?? "none"),
    queryFn: () => getIssue(id as string),
    enabled: id != null,
  });
}

/** GET /issues/latest?edition= — the Editorial landing (tldr by default). */
export function useLatestIssue(edition?: string) {
  return useQuery({
    queryKey: queryKeys.latestIssue(edition),
    queryFn: () => getLatestIssue(edition),
  });
}

/** GET /content/{id}. */
export function useContent(id: string | null) {
  return useQuery({
    queryKey: queryKeys.content(id ?? "none"),
    queryFn: () => getContent(id as string),
    enabled: id != null,
  });
}

/** GET /categories — drives the Library FilterPanel's Category group (CAT_ORDER). */
export function useCategories() {
  return useQuery({ queryKey: queryKeys.categories, queryFn: getCategories });
}

/**
 * GET /library — the paginated Library corpus as an infinite query (#4).
 *
 * The query is keyed on the full `filters` object, so toggling a filter starts a fresh
 * paginated query automatically (this replaces the prototype's client-side applyFilters +
 * cyclePool). `getNextPageParam` advances by offset+limit and returns undefined once the
 * end is reached (next >= total) so infinite scroll stops.
 */
export function useLibrary(filters: LibraryFilters, pageSize: number) {
  return useInfiniteQuery({
    queryKey: queryKeys.library(filters),
    queryFn: ({ pageParam }) =>
      getLibrary({
        types: filters.types,
        editions: filters.editions,
        categories: filters.categories,
        starred: filters.starredOnly,
        limit: pageSize,
        offset: pageParam,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      const next = lastPage.offset + lastPage.limit;
      return next < lastPage.total ? next : undefined;
    },
  });
}
