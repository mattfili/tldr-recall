import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, getCollectionItems, getCollections, postSearch } from "./client";
import type { CollectionRef, SearchResponse } from "../types";

afterEach(() => {
  vi.restoreAllMocks();
});

const HIT_BASE = {
  id: "91b6b997-fe16-4e09-b07c-4119ceaaf241",
  title: "Headroom — agent context compression",
  summary: "Compresses everything an agent reads.",
  content_type: "repo",
  read_minutes: null,
  url: "https://github.com",
  domain: "github.com",
  tags: ["agents", "context"],
  resources: null,
  edition: { key: "tldr", name: "TLDR" },
  category: { slug: "tools", label: "Tools", hue: "var(--c-tools)" },
  issue: { id: "iss", issue_number: "#1", published_at: "2026-06-02" },
  appearances: [],
  starred: false,
};

describe("postSearch", () => {
  it("parses a SearchResponse with score + match_explanation (degraded variant)", async () => {
    const payload: SearchResponse = {
      items: [
        {
          ...HIT_BASE,
          score: 0.0163,
          match_explanation: {
            matched_via: ["lexical"],
            lexical_rank: 1,
            vector_rank: null,
            fused_score: 0.0163,
            type_boost: null,
            degraded: true,
          },
        },
      ],
      total: 1,
      limit: 20,
      offset: 0,
      detected: { types: ["repo"], negations: [] },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 })),
    );

    const res = await postSearch({ query: "github repos about agents" });

    expect(res.total).toBe(1);
    expect(res.items[0].score).toBeCloseTo(0.0163);
    expect(res.items[0].match_explanation.degraded).toBe(true);
    expect(res.items[0].match_explanation.vector_rank).toBeNull();
    expect(res.items[0].match_explanation.matched_via).toEqual(["lexical"]);
    expect(res.detected.types).toEqual(["repo"]);
    // ADR-0002: there is NO read_state on the detected intent.
    expect("read_state" in res.detected).toBe(false);
    // SearchHit is a Content superset.
    expect(res.items[0].title).toBe("Headroom — agent context compression");
  });

  it("parses a hybrid (two-arm) hit with a vector_rank + type_boost", async () => {
    const payload: SearchResponse = {
      items: [
        {
          ...HIT_BASE,
          score: 0.04,
          match_explanation: {
            matched_via: ["lexical", "vector"],
            lexical_rank: 2,
            vector_rank: 1,
            fused_score: 0.04,
            type_boost: null,
            degraded: null,
          },
        },
      ],
      total: 1,
      limit: 20,
      offset: 0,
      detected: { types: ["repo"], negations: [] },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 })),
    );

    const res = await postSearch({ query: "agents" });
    expect(res.items[0].match_explanation.vector_rank).toBe(1);
    expect(res.items[0].match_explanation.matched_via).toContain("vector");
  });

  it("sends a POST with a JSON body", async () => {
    const fetchSpy = vi.fn(
      (input: unknown, init?: RequestInit) => {
        void input;
        void init;
        return Promise.resolve(
          new Response(
            JSON.stringify({
              items: [],
              total: 0,
              limit: 20,
              offset: 0,
              detected: { types: [], negations: [] },
            }),
            { status: 200 },
          ),
        );
      },
    );
    vi.stubGlobal("fetch", fetchSpy);

    await postSearch({ query: "x", limit: 5, offset: 0 });

    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ query: "x", limit: 5, offset: 0 });
  });

  it("throws ApiError on a non-2xx response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 500, statusText: "Server Error" })),
    );
    await expect(postSearch({ query: "x" })).rejects.toBeInstanceOf(ApiError);
  });
});

describe("getCollections / getCollectionItems", () => {
  it("parses CollectionRef[]", async () => {
    const payload: CollectionRef[] = [
      { slug: "ipo-watch", label: "IPO Watch", query: "IPOs and going public", hue: "var(--c-bigtech)" },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 })),
    );
    const cols = await getCollections();
    expect(cols[0].slug).toBe("ipo-watch");
    expect(cols[0].query).toBe("IPOs and going public");
  });

  it("hits /collections/{slug}/items and parses a SearchResponse", async () => {
    const payload: SearchResponse = {
      items: [],
      total: 0,
      limit: 20,
      offset: 0,
      detected: { types: [], negations: [] },
    };
    const fetchSpy = vi.fn((input: unknown) => {
      void input;
      return Promise.resolve(new Response(JSON.stringify(payload), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchSpy);

    await getCollectionItems("ipo-watch", { limit: 50 });

    const url = String(fetchSpy.mock.calls[0][0]);
    expect(url).toContain("/collections/ipo-watch/items");
    expect(url).toContain("limit=50");
  });
});
