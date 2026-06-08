// TanStack Query hooks over the typed API client. This sets up the data layer
// that #4 (Library) and #5 (writes) build on. Queries are read-only in #3.

import { useQuery } from "@tanstack/react-query";
import { getContent, getEditions, getIssue, getIssues, getLatestIssue } from "./client";

export const queryKeys = {
  editions: ["editions"] as const,
  issues: (edition?: string) => ["issues", { edition: edition ?? null }] as const,
  issue: (id: string) => ["issue", id] as const,
  latestIssue: (edition?: string) => ["issue", "latest", { edition: edition ?? null }] as const,
  content: (id: string) => ["content", id] as const,
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
