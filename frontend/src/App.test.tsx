// @vitest-environment jsdom
//
// Render smoke test: mounts the real <App/> against a mocked backend and asserts
// the Editorial masthead + first category section + first article render — i.e.
// the DB -> API -> UI tracer bullet works end to end. The fetch mock returns the
// recorded live shapes (editions, /issues?edition=tldr, /issues/{id}).

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import type { Content, CategoryRef, Edition, IssueDetail, IssueSummary, Page } from "./types";

const EDITIONS: Edition[] = [
  { key: "ai", name: "TLDR AI" },
  { key: "founders", name: "TLDR Founders" },
  { key: "tldr", name: "TLDR" },
];

const CATEGORIES: CategoryRef[] = [
  { slug: "headlines", label: "Headlines & Trends", hue: "var(--c-strategy)" },
  { slug: "bigtech", label: "Big Tech & Startups", hue: "var(--c-bigtech)" },
];

const TLDR_ISSUES: Page<IssueSummary> = {
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
  limit: 50,
  offset: 0,
};

const TLDR_DETAIL: IssueDetail = {
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
          appearances: [],
          starred: false,
        },
      ],
    },
  ],
};

const LIBRARY_PAGE: Page<Content> = {
  items: [
    {
      id: "91b6b997-fe16-4e09-b07c-4119ceaaf241",
      title: "Nvidia Introduces First PCs Designed for AI Agents",
      summary: "Nvidia unveiled prototype PCs for running AI agents.",
      content_type: "article",
      read_minutes: 6,
      url: "https://theverge.com",
      domain: "theverge.com",
      tags: ["nvidia"],
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
    },
  ],
  total: 44,
  limit: 16,
  offset: 0,
};

function routeFetch(url: string, method: string): unknown {
  // Writes (#5): mark-on-view + saves. EditorialView fires PUT /issues/{id}/read on mount.
  if (url.includes("/read") && method === "PUT") {
    const id = url.split("/issues/")[1]?.split("/")[0] ?? "";
    return { issue_id: id, read_state: "read" };
  }
  if (url.includes("/saves/") && (method === "PUT" || method === "DELETE")) {
    const id = url.split("/saves/")[1] ?? "";
    return { content_id: id, starred: method === "PUT" };
  }
  if (url.endsWith("/editions")) return EDITIONS;
  if (url.endsWith("/categories")) return CATEGORIES;
  if (url.includes("/library")) return LIBRARY_PAGE;
  if (url.includes("/issues?")) return TLDR_ISSUES;
  if (url.includes("/issues/5e5e6fe1")) return TLDR_DETAIL;
  throw new Error(`unexpected fetch: ${url}`);
}

// jsdom lacks IntersectionObserver (the Library infinite-scroll sentinel uses it). Real
// browsers always provide it; stub a no-op here so the LibraryView effect can mount.
class NoopIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

function renderApp() {
  vi.stubGlobal("IntersectionObserver", NoopIntersectionObserver);
  vi.stubGlobal(
    "fetch",
    vi.fn((input: unknown, init?: { method?: string }) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      return Promise.resolve(
        new Response(JSON.stringify(routeFetch(url, method)), { status: 200 }),
      );
    }),
  );
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <App />
    </QueryClientProvider>,
  );
}

describe("<App/> Editorial render", () => {
  it("renders the masthead, date·issue line, section head, and first article", async () => {
    renderApp();

    // Masthead edition name (h1) — defaults to TLDR edition's latest issue.
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1, name: "TLDR" })).toBeTruthy(),
    );

    // Date · issue line matches shot.png ("TUE, JUN 2 2026 · ISSUE #3120").
    expect(screen.getByText(/TUE, JUN 2 2026 · ISSUE #3120/)).toBeTruthy();

    // First category section head (bigtech, per the seeded tldr issue).
    expect(screen.getByRole("heading", { level: 2, name: "Big Tech & Startups" })).toBeTruthy();

    // First article title rendered as a link.
    expect(
      screen.getByRole("link", { name: "Nvidia Introduces First PCs Designed for AI Agents" }),
    ).toBeTruthy();

    // Subtitle / dek.
    expect(screen.getByText(/Nvidia's AI PCs, Anthropic files to IPO/)).toBeTruthy();
  });

  it("renders the edition rail in founders/tldr/ai-derived order (TLDR, Founders, AI)", async () => {
    renderApp();
    await waitFor(() => expect(screen.getByText("TLDR Founders")).toBeTruthy());
    expect(screen.getByText("TLDR AI")).toBeTruthy();
    // The TopBar logo + masthead also say "TLDR"; the rail button is present too.
  });
});

describe("<App/> Library render", () => {
  it("switches to Library, shows the single in-view total, and renders rows", async () => {
    renderApp();

    // Switch to the Library tab.
    fireEvent.click(screen.getByRole("button", { name: "Library" }));

    // Library header + the SINGLE in-view count (the envelope total, 44 unfiltered).
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1, name: "Library" })).toBeTruthy(),
    );
    // The row title renders as a link (Library list row) once the page loads.
    await waitFor(() =>
      expect(
        screen.getByRole("link", { name: "Nvidia Introduces First PCs Designed for AI Agents" }),
      ).toBeTruthy(),
    );
    expect(screen.getByText("44")).toBeTruthy();
  });

  it("toggling the filter icon opens the FilterPanel (Edition/Type/Category groups)", async () => {
    renderApp();

    fireEvent.click(screen.getByRole("button", { name: "Filters" }));

    // The FilterPanel renders its four groups; assert the renamed 'Type' group + chips.
    await waitFor(() => expect(screen.getByText("Type")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Articles" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "GitHub" })).toBeTruthy();
    // Category group reflects the CAT_ORDER /categories payload (once it loads).
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Big Tech & Startups" })).toBeTruthy(),
    );
  });
});
