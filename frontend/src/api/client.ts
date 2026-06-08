// Tiny typed fetch client for the Recall FastAPI backend.
// Base URL comes from VITE_API_BASE_URL, defaulting to the local backend
// (see SHARED CONTRACT: backend on http://localhost:8000).

import type { Health } from "../types";

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
