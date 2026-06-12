// TanStack Query hooks over the typed API client. This sets up the data layer
// that #4 (Library) and #5 (writes) build on. Queries are read-only in #3.

import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { analytics } from "../analytics";
import {
  deleteSave,
  getCategories,
  getCollections,
  getContent,
  getEditions,
  getIssue,
  getIssues,
  getLatestIssue,
  getLibrary,
  postSearch,
  putIssueRead,
  putSave,
} from "./client";
import type {
  Content,
  IssueDetail,
  LibraryFilters,
  Page,
  SearchFilters,
} from "../types";

export const queryKeys = {
  editions: ["editions"] as const,
  categories: ["categories"] as const,
  issues: (edition?: string) => ["issues", { edition: edition ?? null }] as const,
  issue: (id: string) => ["issue", id] as const,
  latestIssue: (edition?: string) => ["issue", "latest", { edition: edition ?? null }] as const,
  content: (id: string) => ["content", id] as const,
  library: (filters: LibraryFilters) => ["library", filters] as const,
  search: (query: string, filters?: SearchFilters) =>
    ["search", { query, filters: filters ?? null }] as const,
  collections: ["collections"] as const,
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

// ── unified hybrid search (#7) ──

/**
 * POST /search as an infinite query (#7). Keyed on the TRIMMED query + filters, so changing
 * either starts a fresh paginated search. Enabled only when the query is non-empty (an empty box
 * shows suggestions, not results). `getNextPageParam` advances by offset+limit and stops at total
 * — mirroring useLibrary's infinite-scroll idiom. match_explanation rides along but is hidden.
 */
export function useSearch(query: string, filters: SearchFilters | undefined, pageSize: number) {
  const trimmed = query.trim();
  return useInfiniteQuery({
    queryKey: queryKeys.search(trimmed, filters),
    queryFn: ({ pageParam }) =>
      postSearch({ query: trimmed, filters, limit: pageSize, offset: pageParam }),
    initialPageParam: 0,
    enabled: trimmed.length > 0,
    getNextPageParam: (lastPage) => {
      const next = lastPage.offset + lastPage.limit;
      return next < lastPage.total ? next : undefined;
    },
  });
}

/** GET /collections — the seeded smart collections (suggestion chips that run their query). */
export function useCollections() {
  return useQuery({ queryKey: queryKeys.collections, queryFn: getCollections });
}

// ── writes (#5 / M2) ──

/** Flip `starred` on a single Content (by id) within any cached shape (no-op for others). */
function flipStarred(content: Content, id: string, next: boolean): Content {
  return content.id === id ? { ...content, starred: next } : content;
}

/** Map the flip across one cached library InfiniteData page set. */
function flipLibraryData(
  data: InfiniteData<Page<Content>> | undefined,
  id: string,
  next: boolean,
): InfiniteData<Page<Content>> | undefined {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.map((it) => flipStarred(it, id, next)),
    })),
  };
}

/** Map the flip across one cached IssueDetail (issue/latest). */
function flipIssueDetail(
  data: IssueDetail | undefined,
  id: string,
  next: boolean,
): IssueDetail | undefined {
  if (!data) return data;
  return {
    ...data,
    sections: data.sections.map((section) => ({
      ...section,
      content: section.content.map((it) => flipStarred(it, id, next)),
    })),
  };
}

/**
 * useToggleSave — the OPTIMISTIC Save/Star mutation (#5 core mechanism).
 *
 * mutationFn({id, next}) calls PUT /saves (star) or DELETE /saves (soft unstar), each
 * returning the full SaveState. onMutate cancels in-flight queries, snapshots every cache
 * that carries a Content, and flips `starred` for the id across ALL of them — library
 * InfiniteData (every filter variant, matched by the ["library"] prefix), issue/latest
 * IssueDetail, and the single content(id). onError restores the snapshots; onSettled
 * invalidates so the authoritative membership (incl. the "Starred only" filter) re-fetches.
 *
 * `contentType` rides along only for the save_toggled analytics event (#24) — capturing in
 * onMutate makes this hook the single seam point for every Star call site.
 */
export interface ToggleSaveVars {
  id: string;
  next: boolean;
  contentType: string;
}

export function useToggleSave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, next }: ToggleSaveVars) => (next ? putSave(id) : deleteSave(id)),
    onMutate: async ({ id, next, contentType }: ToggleSaveVars) => {
      analytics.capture("save_toggled", {
        content_id: id,
        content_type: contentType,
        state: next ? "on" : "off",
      });
      await Promise.all([
        qc.cancelQueries({ queryKey: ["library"] }),
        qc.cancelQueries({ queryKey: ["issue"] }),
        qc.cancelQueries({ queryKey: queryKeys.content(id) }),
      ]);

      // Snapshot every affected cache for rollback.
      const libraries = qc.getQueriesData<InfiniteData<Page<Content>>>({
        queryKey: ["library"],
      });
      const issues = qc.getQueriesData<IssueDetail>({ queryKey: ["issue"] });
      const content = qc.getQueryData<Content>(queryKeys.content(id));

      // Apply the optimistic flip.
      qc.setQueriesData<InfiniteData<Page<Content>>>({ queryKey: ["library"] }, (data) =>
        flipLibraryData(data, id, next),
      );
      qc.setQueriesData<IssueDetail>({ queryKey: ["issue"] }, (data) =>
        flipIssueDetail(data, id, next),
      );
      if (content) {
        qc.setQueryData<Content>(queryKeys.content(id), flipStarred(content, id, next));
      }

      return { libraries, issues, content, id };
    },
    onError: (_err, _vars, ctx) => {
      if (!ctx) return;
      for (const [key, data] of ctx.libraries) qc.setQueryData(key, data);
      for (const [key, data] of ctx.issues) qc.setQueryData(key, data);
      qc.setQueryData(queryKeys.content(ctx.id), ctx.content);
    },
    onSettled: (_data, _err, { id }) => {
      qc.invalidateQueries({ queryKey: ["library"] });
      qc.invalidateQueries({ queryKey: ["issue"] });
      qc.invalidateQueries({ queryKey: queryKeys.content(id) });
    },
  });
}

/**
 * useMarkIssueRead — fire on issue view (mark-on-view, ADR-0002). PUT /issues/{id}/read is
 * idempotent; on settle we invalidate the issues query so IssueSummary.read_state + the nav
 * unread markers refresh, and the editions query so the rail's per-edition unread_count
 * dots update as the reader reads (#19).
 */
export function useMarkIssueRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => putIssueRead(id),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["issues"] });
      qc.invalidateQueries({ queryKey: queryKeys.editions });
    },
  });
}
