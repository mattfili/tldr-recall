// Typed fetch client for the Recall FastAPI backend.
// Base URL comes from VITE_API_BASE_URL, defaulting to the local backend
// (see SHARED CONTRACT: backend on http://localhost:8000).

import type {
  CategoryRef,
  Content,
  Edition,
  Health,
  IssueDetail,
  IssueReadState,
  IssueSummary,
  Page,
  SaveState,
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

/** Mutating request (PUT/DELETE) with no body. Mirrors getJson's error handling. */
async function sendJson<T>(method: "PUT" | "DELETE", path: string): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  let res: Response;
  try {
    res = await fetch(url, { method });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    throw new ApiError(`Network error reaching ${url}: ${message}`, 0);
  }
  if (!res.ok) {
    throw new ApiError(`${method} ${path} failed: ${res.status} ${res.statusText}`, res.status);
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

/**
 * GET /library?type=&edition=&category=&starred=&limit=&offset= -> Page<Content>.
 *
 * The Library is the WHOLE ingested corpus, filterable (ADR-0001): dimensions AND
 * together, values within a dimension OR. `types`/`editions`/`categories` are sent as
 * REPEATABLE params (e.g. ?type=article&type=repo) matching the backend's list[str].
 * `starred=true` is only sent when true. There is NO density / read_state param (grilled
 * scope + ADR-0002). `total` in the envelope is the SINGLE in-view count.
 */
export function getLibrary(
  params: {
    types?: string[];
    editions?: string[];
    categories?: string[];
    starred?: boolean;
    limit?: number;
    offset?: number;
  } = {},
): Promise<Page<Content>> {
  const qs = new URLSearchParams();
  for (const v of params.types ?? []) qs.append("type", v);
  for (const v of params.editions ?? []) qs.append("edition", v);
  for (const v of params.categories ?? []) qs.append("category", v);
  if (params.starred) qs.set("starred", "true");
  if (params.limit != null) qs.set("limit", String(params.limit));
  if (params.offset != null) qs.set("offset", String(params.offset));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return getJson<Page<Content>>(`/library${suffix}`);
}

/** GET /categories -> [{slug, label, hue}] ordered by sort (CAT_ORDER). */
export function getCategories(): Promise<CategoryRef[]> {
  return getJson<CategoryRef[]>("/categories");
}

/** PUT /saves/{id} -> SaveState. Upserts starred=true for the stub reader (ADR-0002). */
export function putSave(id: string): Promise<SaveState> {
  return sendJson<SaveState>("PUT", `/saves/${id}`);
}

/**
 * DELETE /saves/{id} -> SaveState. SOFT upsert starred=false (the row is kept, never deleted).
 * Both putSave/deleteSave return the FULL SaveState so the optimistic flip can reconcile.
 */
export function deleteSave(id: string): Promise<SaveState> {
  return sendJson<SaveState>("DELETE", `/saves/${id}`);
}

/**
 * PUT /issues/{id}/read -> IssueReadState. Marks an issue read for the stub reader
 * (ADR-0002 mark-on-view; client-fired when the issue is displayed). Idempotent.
 */
export function putIssueRead(id: string): Promise<IssueReadState> {
  return sendJson<IssueReadState>("PUT", `/issues/${id}/read`);
}
