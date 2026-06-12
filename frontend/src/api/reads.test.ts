// Tests for the #3 read endpoints. These assert the client builds the right
// URLs (query params, path ids) and parses the contract shapes verified live
// against the seeded DB (the JSON below is the recorded /issues/latest shape).

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  getContent,
  getEditions,
  getIssue,
  getIssues,
  getLatestIssue,
} from "./client";
import type { Content, Edition, IssueDetail, IssueSummary, Page } from "../types";

function mockJson(payload: unknown) {
  const fn = vi.fn(
    (...args: unknown[]): Promise<Response> => {
      void args; // recorded in fn.mock.calls; referenced via calledUrl()
      return Promise.resolve(new Response(JSON.stringify(payload), { status: 200 }));
    },
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

/** First-call URL the mocked fetch was invoked with. */
function calledUrl(fn: ReturnType<typeof mockJson>): string {
  return String(fn.mock.calls[0]?.[0]);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getEditions", () => {
  it("parses [{key,name,unread_count,latest_unread}] in backend order", async () => {
    const payload: Edition[] = [
      { key: "ai", name: "TLDR AI", unread_count: 1, latest_unread: true },
      { key: "founders", name: "TLDR Founders", unread_count: 0, latest_unread: false },
      { key: "tldr", name: "TLDR", unread_count: 2, latest_unread: true },
    ];
    const fetchFn = mockJson(payload);
    const editions = await getEditions();
    expect(editions).toEqual(payload);
    expect(calledUrl(fetchFn)).toContain("/editions");
  });
});

describe("getIssues", () => {
  it("builds the edition/limit/offset query string", async () => {
    const payload: Page<IssueSummary> = { items: [], total: 0, limit: 20, offset: 0 };
    const fetchFn = mockJson(payload);
    await getIssues({ edition: "tldr", limit: 50, offset: 10 });
    const url = calledUrl(fetchFn);
    expect(url).toContain("/issues?");
    expect(url).toContain("edition=tldr");
    expect(url).toContain("limit=50");
    expect(url).toContain("offset=10");
  });

  it("omits the query string when no params are given", async () => {
    const payload: Page<IssueSummary> = { items: [], total: 0, limit: 20, offset: 0 };
    const fetchFn = mockJson(payload);
    await getIssues();
    expect(calledUrl(fetchFn)).toMatch(/\/issues$/);
  });

  it("parses the {items,total,limit,offset} envelope", async () => {
    const payload: Page<IssueSummary> = {
      items: [
        {
          id: "5e5e6fe1-051c-475e-91c6-f0e941eb1509",
          edition: { key: "tldr", name: "TLDR" },
          issue_number: "#3120",
          published_at: "2026-06-02",
          subject: "TLDR",
          subtitle: "Nvidia's AI PCs, Anthropic files to IPO, and search as code generation.",
          content_count: 20,
          read_state: "unread",
        },
      ],
      total: 1,
      limit: 20,
      offset: 0,
    };
    mockJson(payload);
    const page = await getIssues({ edition: "tldr" });
    expect(page.total).toBe(1);
    expect(page.items[0].issue_number).toBe("#3120");
    expect(page.items[0].content_count).toBe(20);
  });
});

const LATEST_TLDR: IssueDetail = {
  issue: {
    id: "5e5e6fe1-051c-475e-91c6-f0e941eb1509",
    edition: { key: "tldr", name: "TLDR" },
    issue_number: "#3120",
    published_at: "2026-06-02",
    subject: "TLDR",
    subtitle: "Nvidia's AI PCs, Anthropic files to IPO, and search as code generation.",
  },
  sections: [
    {
      category: { slug: "bigtech", label: "Big Tech & Startups", hue: "var(--c-bigtech)" },
      content: [
        {
          id: "91b6b997-fe16-4e09-b07c-4119ceaaf241",
          title: "Nvidia Introduces First PCs Designed for AI Agents",
          summary:
            "Nvidia unveiled prototype PCs for running AI agents — ~30 laptop and 10 desktop models from Dell, Lenovo, HP, Asus and MSI.",
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
              category: {
                slug: "bigtech",
                label: "Big Tech & Startups",
                hue: "var(--c-bigtech)",
              },
              position: 0,
            },
          ],
          starred: false,
        },
      ],
    },
  ],
};

describe("getLatestIssue", () => {
  it("builds ?edition= and parses IssueDetail with sections", async () => {
    const fetchFn = mockJson(LATEST_TLDR);
    const detail = await getLatestIssue("tldr");
    expect(calledUrl(fetchFn)).toContain("/issues/latest?edition=tldr");
    expect(detail.issue.issue_number).toBe("#3120");
    expect(detail.sections[0].category.slug).toBe("bigtech");
    expect(detail.sections[0].category.hue).toBe("var(--c-bigtech)");
    expect(detail.sections[0].content[0].title).toContain("Nvidia");
  });

  it("omits ?edition= when called without an edition", async () => {
    const fetchFn = mockJson(LATEST_TLDR);
    await getLatestIssue();
    expect(calledUrl(fetchFn)).toMatch(/\/issues\/latest$/);
  });
});

describe("getIssue", () => {
  it("requests /issues/{id}", async () => {
    const fetchFn = mockJson(LATEST_TLDR);
    await getIssue("5e5e6fe1-051c-475e-91c6-f0e941eb1509");
    expect(calledUrl(fetchFn)).toContain(
      "/issues/5e5e6fe1-051c-475e-91c6-f0e941eb1509",
    );
  });
});

describe("getContent", () => {
  it("requests /content/{id} and parses resources[] (k/label/meta)", async () => {
    const payload: Content = {
      id: "8a2bfeee-a7ab-4d4f-88a0-05eb793aa7e6",
      title: "Rethinking Search as Code Generation",
      summary: "Perplexity's Search as Code exposes the search stack as SDK primitives…",
      content_type: "paper",
      read_minutes: 34,
      url: "https://perplexity.ai/research",
      domain: "perplexity.ai/research",
      tags: ["perplexity", "search", "agents", "rag", "sdk"],
      resources: [
        { k: "paper", label: "SaC technical report" },
        { k: "repo", label: "perplexity/sac-sdk", meta: "examples/" },
      ],
      edition: { key: "tldr", name: "TLDR" },
      category: { slug: "prog", label: "Programming, Design & Data", hue: "var(--c-prog)" },
      issue: {
        id: "5e5e6fe1-051c-475e-91c6-f0e941eb1509",
        issue_number: "#3120",
        published_at: "2026-06-02",
      },
      appearances: [],
      starred: true,
    };
    const fetchFn = mockJson(payload);
    const content = await getContent("8a2bfeee-a7ab-4d4f-88a0-05eb793aa7e6");
    expect(calledUrl(fetchFn)).toContain(
      "/content/8a2bfeee-a7ab-4d4f-88a0-05eb793aa7e6",
    );
    expect(content.resources?.[1]).toEqual({
      k: "repo",
      label: "perplexity/sac-sdk",
      meta: "examples/",
    });
    expect(content.starred).toBe(true);
  });

  it("throws ApiError on a 404", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("not found", { status: 404, statusText: "Not Found" })),
    );
    await expect(getContent("missing")).rejects.toBeInstanceOf(ApiError);
  });
});
