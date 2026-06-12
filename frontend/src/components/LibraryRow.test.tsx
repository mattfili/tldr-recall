// @vitest-environment jsdom
//
// Render test for LibraryRow's edition column (#27, ADR-0001): multi-appearance Content shows
// every edition it appeared in ("TLDR · AI"), duplicate same-edition sightings dedupe to one
// entry, and single-appearance Content renders exactly as before ("TLDR").

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LibraryRow } from "./LibraryRow";
import type { Appearance, Content, EditionRef } from "../types";

// #24: mock the analytics seam so the article_open wiring can be asserted (no SDK/network).
const analyticsMock = vi.hoisted(() => ({ capture: vi.fn() }));
vi.mock("../analytics", () => ({ analytics: analyticsMock }));

const TLDR: EditionRef = { key: "tldr", name: "TLDR" };
const AI: EditionRef = { key: "ai", name: "AI" };

function appearance(
  edition: EditionRef,
  issueId: string,
  published_at = "2026-06-02",
): Appearance {
  return {
    issue: { id: issueId, issue_number: "#1", published_at },
    edition,
    category: { slug: "tools", label: "Tools", hue: "var(--c-tools)" },
    position: 0,
  };
}

/** ISO date `n` days before today — keeps formatRecency assertions clock-safe. */
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Mock Content mirroring types.ts (same shape idiom as SearchView.test.tsx's SEARCH_RESPONSE).
function content(appearances: Appearance[]): Content {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    title: "Headroom — agent context compression",
    summary: "Compresses everything an agent reads.",
    content_type: "repo",
    read_minutes: null,
    url: "https://github.com",
    domain: "github.com",
    tags: ["agents", "context"],
    resources: null,
    edition: TLDR,
    category: { slug: "tools", label: "Tools", hue: "var(--c-tools)" },
    issue: { id: "iss", issue_number: "#1", published_at: "2026-06-02" },
    appearances,
    starred: false,
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  analyticsMock.capture.mockClear();
});

// LibraryRow uses useToggleSave, so it needs a QueryClientProvider.
function renderRow(it: Content) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <LibraryRow it={it} expanded={false} />
    </QueryClientProvider>,
  );
}

describe("<LibraryRow/> edition column (#27)", () => {
  it("shows every edition for multi-appearance Content, primary first", () => {
    renderRow(content([appearance(TLDR, "iss"), appearance(AI, "iss-ai")]));
    expect(screen.getByText("TLDR · AI")).toBeTruthy();
  });

  it("shows exactly the primary edition for single-appearance Content (unchanged)", () => {
    renderRow(content([appearance(TLDR, "iss")]));
    expect(screen.getByText("TLDR")).toBeTruthy();
    expect(screen.queryByText(/·/)).toBeNull();
  });

  it("dedupes duplicate same-edition appearances (no 'TLDR · TLDR · AI')", () => {
    renderRow(
      content([appearance(TLDR, "iss"), appearance(AI, "iss-ai"), appearance(TLDR, "iss-2")]),
    );
    expect(screen.getByText("TLDR · AI")).toBeTruthy();
    expect(screen.queryByText("TLDR · TLDR · AI")).toBeNull();
    expect(screen.queryByText("TLDR · AI · TLDR")).toBeNull();
  });
});

describe("<LibraryRow/> latest-release-date column (#51)", () => {
  it("shows the MOST RECENT appearance's date, not the primary (earliest) one", () => {
    // Primary (flat issue) is 10d old; a later AI sighting is 3d old -> "3d ago" wins.
    const it_ = content([appearance(TLDR, "iss", daysAgo(10)), appearance(AI, "iss-ai", daysAgo(3))]);
    it_.issue = { id: "iss", issue_number: "#1", published_at: daysAgo(10) };
    renderRow(it_);
    expect(screen.getByTestId("latest-date").textContent).toBe("3d ago");
  });

  it("single-appearance Content shows its one date", () => {
    const it_ = content([appearance(TLDR, "iss", daysAgo(2))]);
    it_.issue = { id: "iss", issue_number: "#1", published_at: daysAgo(2) };
    renderRow(it_);
    expect(screen.getByTestId("latest-date").textContent).toBe("2d ago");
  });
});

describe("<LibraryRow/> analytics (#24)", () => {
  it("opening the title fires article_open with source_view 'library'", () => {
    vi.stubGlobal("open", vi.fn()); // platform.openExternal → window.open
    renderRow(content([appearance(TLDR, "iss")]));
    fireEvent.click(screen.getByRole("link", { name: "Headroom — agent context compression" }));

    expect(analyticsMock.capture).toHaveBeenCalledTimes(1);
    expect(analyticsMock.capture).toHaveBeenCalledWith("article_open", {
      content_id: "11111111-1111-1111-1111-111111111111",
      content_type: "repo",
      domain: "github.com",
      edition: "tldr",
      category: "tools",
      source_view: "library",
    });
  });
});
