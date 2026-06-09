// Tests for the #4 Library client (getLibrary / getCategories). These assert the client
// builds the right URLs (REPEATABLE type/edition/category params + starred/limit/offset,
// matching the backend list[str]) and parses the contract shapes (Page<Content>,
// CategoryRef[]). The Content fixture is the recorded live shape from reads.test.ts.

import { afterEach, describe, expect, it, vi } from "vitest";
import { getCategories, getLibrary } from "./client";
import type { CategoryRef, Content, Page } from "../types";

function mockJson(payload: unknown) {
  const fn = vi.fn(
    (...args: unknown[]): Promise<Response> => {
      void args;
      return Promise.resolve(new Response(JSON.stringify(payload), { status: 200 }));
    },
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

function calledUrl(fn: ReturnType<typeof mockJson>): string {
  return String(fn.mock.calls[0]?.[0]);
}

afterEach(() => {
  vi.restoreAllMocks();
});

const SAMPLE_CONTENT: Content = {
  id: "91b6b997-fe16-4e09-b07c-4119ceaaf241",
  title: "Nvidia Introduces First PCs Designed for AI Agents",
  summary: "Nvidia unveiled prototype PCs for running AI agents.",
  content_type: "article",
  read_minutes: 6,
  url: "https://theverge.com",
  domain: "theverge.com",
  tags: ["nvidia", "hardware", "agents"],
  resources: null,
  edition: { key: "tldr", name: "TLDR" },
  category: { slug: "bigtech", label: "Big Tech & Startups", hue: "var(--c-bigtech)" },
  issue: {
    id: "5e5e6fe1-051c-475e-91c6-f0e941eb1509",
    issue_number: "#3120",
    published_at: "2026-06-02",
  },
  appearances: [
    {
      issue: {
        id: "5e5e6fe1-051c-475e-91c6-f0e941eb1509",
        issue_number: "#3120",
        published_at: "2026-06-02",
      },
      edition: { key: "tldr", name: "TLDR" },
      category: { slug: "bigtech", label: "Big Tech & Startups", hue: "var(--c-bigtech)" },
      position: 0,
    },
  ],
  starred: false,
};

describe("getLibrary", () => {
  it("builds REPEATABLE type/edition/category params + starred/limit/offset", async () => {
    const payload: Page<Content> = { items: [], total: 0, limit: 16, offset: 0 };
    const fetchFn = mockJson(payload);
    await getLibrary({
      types: ["article", "repo"],
      editions: ["tldr"],
      categories: ["bigtech"],
      starred: true,
      limit: 16,
      offset: 32,
    });
    const url = calledUrl(fetchFn);
    expect(url).toContain("/library?");
    // repeatable: each value is its own key=value pair.
    expect(url).toContain("type=article");
    expect(url).toContain("type=repo");
    expect(url).toContain("edition=tldr");
    expect(url).toContain("category=bigtech");
    expect(url).toContain("starred=true");
    expect(url).toContain("limit=16");
    expect(url).toContain("offset=32");
  });

  it("omits starred when false and omits empty dimensions", async () => {
    const payload: Page<Content> = { items: [], total: 0, limit: 16, offset: 0 };
    const fetchFn = mockJson(payload);
    await getLibrary({ types: [], starred: false, limit: 16, offset: 0 });
    const url = calledUrl(fetchFn);
    expect(url).not.toContain("starred");
    expect(url).not.toContain("type=");
    expect(url).not.toContain("edition=");
    expect(url).not.toContain("category=");
  });

  it("omits the query string entirely when no params are given", async () => {
    const payload: Page<Content> = { items: [], total: 0, limit: 20, offset: 0 };
    const fetchFn = mockJson(payload);
    await getLibrary();
    expect(calledUrl(fetchFn)).toMatch(/\/library$/);
  });

  it("parses the Page<Content> envelope incl. appearances[] + per-reader state", async () => {
    const payload: Page<Content> = {
      items: [SAMPLE_CONTENT],
      total: 44,
      limit: 16,
      offset: 0,
    };
    mockJson(payload);
    const page = await getLibrary({ limit: 16, offset: 0 });
    expect(page.total).toBe(44);
    expect(page.items[0].title).toContain("Nvidia");
    expect(page.items[0].appearances[0].edition.key).toBe("tldr");
    expect(page.items[0].starred).toBe(false);
  });
});

describe("getCategories", () => {
  it("hits /categories and parses CategoryRef[] (slug/label/hue)", async () => {
    const payload: CategoryRef[] = [
      { slug: "headlines", label: "Headlines & Trends", hue: "var(--c-strategy)" },
      { slug: "bigtech", label: "Big Tech & Startups", hue: "var(--c-bigtech)" },
    ];
    const fetchFn = mockJson(payload);
    const cats = await getCategories();
    expect(calledUrl(fetchFn)).toContain("/categories");
    expect(cats).toEqual(payload);
    expect(cats[1].hue).toBe("var(--c-bigtech)");
  });
});
