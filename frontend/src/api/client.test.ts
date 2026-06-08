import { afterEach, describe, expect, it, vi } from "vitest";
import { getHealth, ApiError } from "./client";
import type { Health } from "../types";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getHealth", () => {
  it("parses the /health contract shape", async () => {
    const payload: Health = {
      status: "ok",
      db: "ok",
      embedder: "text-embedding-3-small",
      version: "0.1.0",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 })),
    );

    const health = await getHealth();

    expect(health).toEqual(payload);
    expect(health.status).toBe("ok");
    expect(health.db).toBe("ok");
    expect(health.embedder).toBe("text-embedding-3-small");
    expect(health.version).toBe("0.1.0");
  });

  it("surfaces a db error string from the contract", async () => {
    const payload: Health = {
      status: "ok",
      db: "error: connection refused",
      embedder: "unconfigured",
      version: "0.1.0",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 })),
    );

    const health = await getHealth();

    expect(health.db).toBe("error: connection refused");
    expect(health.embedder).toBe("unconfigured");
  });

  it("throws ApiError on a non-2xx response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 500, statusText: "Server Error" })),
    );

    await expect(getHealth()).rejects.toBeInstanceOf(ApiError);
  });

  it("throws ApiError on a network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );

    await expect(getHealth()).rejects.toBeInstanceOf(ApiError);
  });
});
