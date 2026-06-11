// @vitest-environment jsdom
//
// Render test for the unified SearchView (#7): mounts it against a mocked backend, asserts the
// input + suggestions render, submitting a suggestion produces a results list reusing ContentItem
// (hit titles render), and the dropped "haven't read" suggestion is absent (ADR-0002).
// Also covers the multi-edition provenance badge (#27, ADR-0001): multi-appearance hits show
// "TLDR · AI" (deduped across duplicate same-edition sightings), single-appearance hits show
// no edition text at all (unchanged).

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SearchView } from "./SearchView";
import type { CollectionRef, SearchResponse } from "../types";

// #24: mock the analytics seam (NOT posthog) so the wiring tests can assert captures.
// The mock is module-wide; the pre-existing tests simply never look at it.
const analyticsMock = vi.hoisted(() => ({ capture: vi.fn() }));
vi.mock("../analytics", () => ({ analytics: analyticsMock }));

const SEARCH_RESPONSE: SearchResponse = {
  items: [
    {
      id: "11111111-1111-1111-1111-111111111111",
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
      appearances: [
        {
          issue: { id: "iss", issue_number: "#1", published_at: "2026-06-02" },
          edition: { key: "tldr", name: "TLDR" },
          category: { slug: "tools", label: "Tools", hue: "var(--c-tools)" },
          position: 0,
        },
      ],
      starred: false,
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
    {
      // Multi-appearance hit (#27): primary TLDR + AI + a SECOND TLDR sighting in a
      // different issue — the badge must dedupe to "TLDR · AI".
      id: "22222222-2222-2222-2222-222222222222",
      title: "Anthropic ships a new agent SDK",
      summary: "Covered in both TLDR and TLDR AI.",
      content_type: "article",
      read_minutes: 4,
      url: "https://anthropic.com",
      domain: "anthropic.com",
      tags: ["agents"],
      resources: null,
      edition: { key: "tldr", name: "TLDR" },
      category: { slug: "bigtech", label: "Big Tech", hue: "var(--c-bigtech)" },
      issue: { id: "iss", issue_number: "#1", published_at: "2026-06-02" },
      appearances: [
        {
          issue: { id: "iss", issue_number: "#1", published_at: "2026-06-02" },
          edition: { key: "tldr", name: "TLDR" },
          category: { slug: "bigtech", label: "Big Tech", hue: "var(--c-bigtech)" },
          position: 1,
        },
        {
          issue: { id: "iss-ai", issue_number: "#9", published_at: "2026-06-03" },
          edition: { key: "ai", name: "AI" },
          category: null,
          position: 0,
        },
        {
          issue: { id: "iss-2", issue_number: "#2", published_at: "2026-06-04" },
          edition: { key: "tldr", name: "TLDR" },
          category: null,
          position: 3,
        },
      ],
      starred: false,
      score: 0.0151,
      match_explanation: {
        matched_via: ["lexical"],
        lexical_rank: 2,
        vector_rank: null,
        fused_score: 0.0151,
        type_boost: null,
        degraded: true,
      },
    },
  ],
  total: 2,
  limit: 12,
  offset: 0,
  detected: { types: ["repo"], negations: [] },
};

const COLLECTIONS: CollectionRef[] = [
  { slug: "ipo-watch", label: "IPO Watch", query: "IPOs and going public", hue: "var(--c-bigtech)" },
];

class NoopIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

function routeFetch(url: string): unknown {
  if (url.includes("/search")) return SEARCH_RESPONSE;
  if (url.includes("/collections")) return COLLECTIONS;
  throw new Error(`unexpected fetch: ${url}`);
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  analyticsMock.capture.mockClear();
});

function renderSearch() {
  vi.stubGlobal("IntersectionObserver", NoopIntersectionObserver);
  vi.stubGlobal(
    "fetch",
    vi.fn((input: unknown) =>
      Promise.resolve(new Response(JSON.stringify(routeFetch(String(input))), { status: 200 })),
    ),
  );
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let query = "";
  return render(
    <QueryClientProvider client={qc}>
      <SearchView query={query} onSetQuery={(q) => (query = q)} />
    </QueryClientProvider>,
  );
}

describe("<SearchView/>", () => {
  it("renders the search input and the TRY ASKING suggestions", () => {
    renderSearch();
    expect(screen.getByLabelText("Search your library")).toBeTruthy();
    expect(screen.getByText("TRY ASKING")).toBeTruthy();
    expect(screen.getByRole("button", { name: "github repos about agents" })).toBeTruthy();
  });

  it("does NOT render the dropped 'haven't read' suggestion (ADR-0002)", () => {
    renderSearch();
    expect(screen.queryByText(/haven.t read/i)).toBeNull();
    expect(screen.queryByText(/unread/i)).toBeNull();
  });

  it("submitting a suggestion runs the search and renders ContentItem result rows", async () => {
    renderSearch();
    fireEvent.click(screen.getByRole("button", { name: "github repos about agents" }));

    // Results header + the hit title rendered through ContentItem (a link).
    await waitFor(() => expect(screen.getByText("2 results")).toBeTruthy());
    expect(
      screen.getByRole("link", { name: "Headroom — agent context compression" }),
    ).toBeTruthy();
  });

  it("typing + Enter submits the query", async () => {
    renderSearch();
    const input = screen.getByLabelText("Search your library");
    fireEvent.change(input, { target: { value: "anthropic ipo" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(screen.getByText("2 results")).toBeTruthy());
  });

  it("shows a deduped multi-edition badge on multi-appearance hits (#27)", async () => {
    renderSearch();
    fireEvent.click(screen.getByRole("button", { name: "github repos about agents" }));
    await waitFor(() => expect(screen.getByText("2 results")).toBeTruthy());

    // Three appearances (TLDR, AI, TLDR-again) dedupe to exactly ONE "TLDR · AI" badge —
    // not "TLDR · AI · TLDR".
    expect(screen.getAllByText("TLDR · AI")).toHaveLength(1);
    expect(screen.queryByText("TLDR · AI · TLDR")).toBeNull();
  });

  it("renders single-appearance hits with NO edition text (unchanged by #27)", async () => {
    renderSearch();
    fireEvent.click(screen.getByRole("button", { name: "github repos about agents" }));
    await waitFor(() => expect(screen.getByText("2 results")).toBeTruthy());

    // The single-appearance hit shows no edition badge at all: the only edition text in the
    // whole results list is the multi-edition hit's joined badge, and no standalone "TLDR".
    expect(screen.queryByText("TLDR")).toBeNull();
  });
});

describe("<SearchView/> analytics (#24)", () => {
  it("fires search_performed exactly once when the first page of results arrives", async () => {
    renderSearch();
    fireEvent.click(screen.getByRole("button", { name: "github repos about agents" }));
    await waitFor(() => expect(screen.getByText("2 results")).toBeTruthy());

    const fired = analyticsMock.capture.mock.calls.filter(([e]) => e === "search_performed");
    expect(fired).toHaveLength(1);
    expect(fired[0][1]).toEqual({
      query: "github repos about agents",
      result_count: 2,
      detected_types: ["repo"],
      had_results: true,
    });
  });

  it("clicking a hit fires BOTH result_open (0-based rank) and article_open with source_view 'search'", async () => {
    renderSearch();
    vi.stubGlobal("open", vi.fn()); // platform.openExternal → window.open
    fireEvent.click(screen.getByRole("button", { name: "github repos about agents" }));
    await waitFor(() => expect(screen.getByText("2 results")).toBeTruthy());

    fireEvent.click(
      screen.getByRole("link", { name: "Headroom — agent context compression" }),
    );

    expect(analyticsMock.capture).toHaveBeenCalledWith("result_open", {
      content_id: "11111111-1111-1111-1111-111111111111",
      rank: 0,
      query: "github repos about agents",
    });
    expect(analyticsMock.capture).toHaveBeenCalledWith("article_open", {
      content_id: "11111111-1111-1111-1111-111111111111",
      content_type: "repo",
      domain: "github.com",
      edition: "tldr",
      category: "tools",
      source_view: "search",
    });
  });

  it("gives the SECOND hit rank 1 (0-based position in the results list)", async () => {
    renderSearch();
    vi.stubGlobal("open", vi.fn());
    fireEvent.click(screen.getByRole("button", { name: "github repos about agents" }));
    await waitFor(() => expect(screen.getByText("2 results")).toBeTruthy());

    fireEvent.click(screen.getByRole("link", { name: "Anthropic ships a new agent SDK" }));

    expect(analyticsMock.capture).toHaveBeenCalledWith(
      "result_open",
      expect.objectContaining({ rank: 1 }),
    );
  });
});
