// @vitest-environment jsdom
//
// Render test for the unified SearchView (#7): mounts it against a mocked backend, asserts the
// input + suggestions render, submitting a suggestion produces a results list reusing ContentItem
// (hit titles render), and the dropped "haven't read" suggestion is absent (ADR-0002).
// Also covers the search metadata cluster (#42, superseding #27's >1-editions gate on this
// surface): EVERY hit shows edition(s) + recency — multi-appearance hits show the deduped
// primary-first list ("TLDR · AI · 3d ago", #27 ordering preserved) and single-appearance hits
// now show their edition too ("TLDR · 3d ago").
//
// Fixture dates are computed RELATIVE TO TODAY (3 days ago) so the recency assertion is
// deterministic without fake timers (which fight waitFor/react-query). Compact-date and
// cross-year boundaries are covered by the pure formatter tests in format.test.ts.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SearchView } from "./SearchView";
import type { CollectionRef, SearchFilters, SearchResponse } from "../types";

// #24: mock the analytics seam (NOT posthog) so the wiring tests can assert captures.
// The mock is module-wide; the pre-existing tests simply never look at it.
const analyticsMock = vi.hoisted(() => ({ capture: vi.fn() }));
vi.mock("../analytics", () => ({ analytics: analyticsMock }));

/** Local 'YYYY-MM-DD' for `n` days before today — keeps recency assertions clock-proof. */
function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// Primary issue date for BOTH hits: 3 days ago -> recency renders "3d ago" (#42).
const PUBLISHED = isoDaysAgo(3);

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
      issue: { id: "iss", issue_number: "#1", published_at: PUBLISHED },
      appearances: [
        {
          issue: { id: "iss", issue_number: "#1", published_at: PUBLISHED },
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
      issue: { id: "iss", issue_number: "#1", published_at: PUBLISHED },
      appearances: [
        {
          issue: { id: "iss", issue_number: "#1", published_at: PUBLISHED },
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
  // stubAnimate() patches the prototype directly (jsdom never defines it) — remove it again.
  delete (Element.prototype as { animate?: unknown }).animate;
});

function renderSearch(props: Partial<Parameters<typeof SearchView>[0]> = {}) {
  vi.stubGlobal("IntersectionObserver", NoopIntersectionObserver);
  const fetchFn = vi.fn((input: unknown, init?: { body?: string }) => {
    void init; // typed so tests can read the recorded POST body off mock.calls
    return Promise.resolve(
      new Response(JSON.stringify(routeFetch(String(input))), { status: 200 }),
    );
  });
  vi.stubGlobal("fetch", fetchFn);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let query = "";
  render(
    <QueryClientProvider client={qc}>
      <SearchView query={query} onSetQuery={(q) => (query = q)} {...props} />
    </QueryClientProvider>,
  );
  return { fetchFn };
}

/** renderSearch with a DEFERRED /search response — lets tests observe the in-flight state. */
function renderSearchDeferred() {
  vi.stubGlobal("IntersectionObserver", NoopIntersectionObserver);
  const pending: ((r: SearchResponse) => void)[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: unknown) => {
      const url = String(input);
      if (url.includes("/search"))
        return new Promise<Response>((res) => {
          pending.push((r) => res(new Response(JSON.stringify(r), { status: 200 })));
        });
      if (url.includes("/collections"))
        return Promise.resolve(new Response(JSON.stringify(COLLECTIONS), { status: 200 }));
      throw new Error(`unexpected fetch: ${url}`);
    }),
  );
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <SearchView query="" onSetQuery={() => {}} />
    </QueryClientProvider>,
  );
  return { resolveSearch: (r: SearchResponse) => pending.shift()?.(r) };
}

/** The #44 icon wrapper's current machine state. */
function iconState(): string | null {
  return screen.getByTestId("search-icon").getAttribute("data-state");
}

/** Install a WAAPI stub (jsdom has none) so the pulse/rotation calls are observable. */
function stubAnimate() {
  const spy = vi.fn((keyframes?: unknown) => {
    void keyframes; // typed so tests can inspect the recorded keyframes off mock.calls
    return { cancel: vi.fn(), finish: vi.fn() };
  });
  Element.prototype.animate = spy as unknown as typeof Element.prototype.animate;
  return spy;
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

  it("shows the deduped edition list + recency on multi-appearance hits (#27 ordering, #42)", async () => {
    renderSearch();
    fireEvent.click(screen.getByRole("button", { name: "github repos about agents" }));
    await waitFor(() => expect(screen.getByText("2 results")).toBeTruthy());

    // Three appearances (TLDR, AI, TLDR-again) dedupe to exactly ONE primary-first
    // "TLDR · AI" list — never "TLDR · AI · TLDR" — followed by the recency (#42).
    expect(screen.getAllByText("TLDR · AI · 3d ago")).toHaveLength(1);
    expect(screen.queryByText(/TLDR · AI · TLDR/)).toBeNull();
  });

  it("renders single-appearance hits WITH their edition + recency in search (#42)", async () => {
    renderSearch();
    fireEvent.click(screen.getByRole("button", { name: "github repos about agents" }));
    await waitFor(() => expect(screen.getByText("2 results")).toBeTruthy());

    // #42 inverts the old #27 expectation on the search surface: the single-appearance hit
    // now shows its edition + recency too.
    expect(screen.getAllByText("TLDR · 3d ago")).toHaveLength(1);
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

describe("<SearchView/> icon state machine (#44)", () => {
  it("walks idle → typing → searching → results, and back to idle on clear", async () => {
    const { resolveSearch } = renderSearchDeferred();
    expect(iconState()).toBe("idle");

    const input = screen.getByLabelText("Search your library");
    fireEvent.change(input, { target: { value: "agents" } });
    expect(iconState()).toBe("typing");

    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(iconState()).toBe("searching"));

    resolveSearch(SEARCH_RESPONSE);
    await waitFor(() => expect(iconState()).toBe("results"));

    fireEvent.click(screen.getByLabelText("clear"));
    expect(iconState()).toBe("idle");
  });

  it("pulses ONCE per empty→typing transition (not per keystroke), and again after clear", () => {
    const spy = stubAnimate();
    renderSearch();
    const input = screen.getByLabelText("Search your library");

    fireEvent.change(input, { target: { value: "a" } });
    fireEvent.change(input, { target: { value: "ag" } });
    fireEvent.change(input, { target: { value: "age" } });
    expect(spy).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByLabelText("clear"));
    fireEvent.change(input, { target: { value: "b" } });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("rotates while the search is in flight and cancels the spin on settle", async () => {
    const spy = stubAnimate();
    const { resolveSearch } = renderSearchDeferred();
    const input = screen.getByLabelText("Search your library");
    fireEvent.change(input, { target: { value: "agents" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(iconState()).toBe("searching"));

    const rotateIdx = spy.mock.calls.findIndex((args) =>
      JSON.stringify(args[0] ?? "").includes("rotate"),
    );
    expect(rotateIdx).toBeGreaterThanOrEqual(0);
    const spin = spy.mock.results[rotateIdx].value as { cancel: ReturnType<typeof vi.fn> };

    resolveSearch(SEARCH_RESPONSE);
    await waitFor(() => expect(iconState()).toBe("results"));
    expect(spin.cancel).toHaveBeenCalled();
  });

  it("honors prefers-reduced-motion: no WAAPI animations at all", () => {
    const spy = stubAnimate();
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: true })),
    );
    renderSearch();
    const input = screen.getByLabelText("Search your library");
    fireEvent.change(input, { target: { value: "agents" } });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("<SearchView/> starred toggle + caption (#46)", () => {
  const STARRED_FILTERS: SearchFilters = {
    types: [],
    editions: [],
    categories: [],
    starred: true,
  };

  it("renders the exact Bengio caption (old caption gone) with the toggle pushed far right", async () => {
    renderSearch();
    fireEvent.click(screen.getByRole("button", { name: "github repos about agents" }));
    await waitFor(() => expect(screen.getByText("2 results")).toBeTruthy());

    expect(screen.getByText("Search brought to you by Yoshua Bengio")).toBeTruthy();
    expect(screen.queryByText(/ranked by meaning across your library/)).toBeNull();

    const toggle = screen.getByRole("button", { name: "Starred only" });
    expect(toggle.style.marginLeft).toBe("auto");
  });

  it("starred toggle is an rc-chip reflecting filters.starred and calls onToggleStarred", async () => {
    const onToggleStarred = vi.fn();
    renderSearch({ filters: STARRED_FILTERS, onToggleStarred });
    fireEvent.click(screen.getByRole("button", { name: "github repos about agents" }));
    await waitFor(() => expect(screen.getByText("2 results")).toBeTruthy());

    const toggle = screen.getByRole("button", { name: "Starred only" });
    expect(toggle.className).toBe("rc-chip on");
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(toggle);
    expect(onToggleStarred).toHaveBeenCalledTimes(1);
  });

  it("sends filters.starred=true in the POST /search payload when the filter is on", async () => {
    const { fetchFn } = renderSearch({ filters: STARRED_FILTERS });
    fireEvent.click(screen.getByRole("button", { name: "github repos about agents" }));
    await waitFor(() => expect(screen.getByText("2 results")).toBeTruthy());

    const searchCall = fetchFn.mock.calls.find(([input]) => String(input).includes("/search"));
    expect(searchCall).toBeTruthy();
    const body = JSON.parse(String(searchCall?.[1]?.body));
    expect(body.filters.starred).toBe(true);
  });
});
