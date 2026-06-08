// Shared TS types mirroring the FastAPI contract.
// In M0 this covers only GET /health; later milestones (#2/#3) add
// Content/Issue/Edition/etc. mirroring recall/schemas/.

/**
 * GET /health response.
 *
 * Mirrors the SHARED CONTRACT exactly:
 *   {
 *     "status": "ok",
 *     "db": "ok" | "error: <msg>",
 *     "embedder": "<model name or 'unconfigured'>",
 *     "version": "<app version>"
 *   }
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
