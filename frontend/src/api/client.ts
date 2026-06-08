// Typed fetch client for the Recall FastAPI backend.
// Base URL comes from VITE_API_BASE_URL, defaulting to the local backend
// (see SHARED CONTRACT: backend on http://localhost:8000).

import type {
  Content,
  Edition,
  Health,
  IssueDetail,
  IssueSummary,
  Page,
} from "../types";

export const API_BASE_URL: string =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

/** Thrown when a request fails or returns a non-2xx status. */
export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function getJson<T>(path: string): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  let res: Response;
  try {
    res = await fetch(url);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    throw new ApiError(`Network error reaching ${url}: ${message}`, 0);
  }
  if (!res.ok) {
    throw new ApiError(`GET ${path} failed: ${res.status} ${res.statusText}`, res.status);
  }
  return (await res.json()) as T;
}

/** GET /health — proves the client -> API -> DB path is wired. */
export function getHealth(): Promise<Health> {
  return getJson<Health>("/health");
}

/** GET /editions -> [{key, name}] (order is backend's; frontend controls rail order). */
export function getEditions(): Promise<Edition[]> {
  return getJson<Edition[]>("/editions");
}

/**
 * GET /issues?edition=&limit=&offset= -> paginated {items, total, limit, offset},
 * NEWEST FIRST. `edition` filters to one edition's issues.
 */
export function getIssues(params: {
  edition?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<Page<IssueSummary>> {
  const qs = new URLSearchParams();
  if (params.edition) qs.set("edition", params.edition);
  if (params.limit != null) qs.set("limit", String(params.limit));
  if (params.offset != null) qs.set("offset", String(params.offset));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return getJson<Page<IssueSummary>>(`/issues${suffix}`);
}

/** GET /issues/{id} -> IssueDetail (issue meta + category sections). */
export function getIssue(id: string): Promise<IssueDetail> {
  return getJson<IssueDetail>(`/issues/${id}`);
}

/**
 * GET /issues/latest?edition= -> IssueDetail (newest issue of that edition;
 * if edition omitted, newest overall). The Editorial landing uses edition=tldr.
 */
export function getLatestIssue(edition?: string): Promise<IssueDetail> {
  const suffix = edition ? `?edition=${encodeURIComponent(edition)}` : "";
  return getJson<IssueDetail>(`/issues/latest${suffix}`);
}

/** GET /content/{id} -> the canonical Content object. */
export function getContent(id: string): Promise<Content> {
  return getJson<Content>(`/content/${id}`);
}
