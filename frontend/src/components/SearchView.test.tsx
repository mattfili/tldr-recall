// @vitest-environment jsdom
//
// Render test for the unified SearchView (#7): mounts it against a mocked backend, asserts the
// input + suggestions render, submitting a suggestion produces a results list reusing ContentItem
// (hit titles render), and the dropped "haven't read" suggestion is absent (ADR-0002).

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SearchView } from "./SearchView";
import type { CollectionRef, SearchResponse } from "../types";

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
  ],
  total: 1,
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
    await waitFor(() => expect(screen.getByText("1 result")).toBeTruthy());
    expect(
      screen.getByRole("link", { name: "Headroom — agent context compression" }),
    ).toBeTruthy();
  });

  it("typing + Enter submits the query", async () => {
    renderSearch();
    const input = screen.getByLabelText("Search your library");
    fireEvent.change(input, { target: { value: "anthropic ipo" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(screen.getByText("1 result")).toBeTruthy());
  });
});
