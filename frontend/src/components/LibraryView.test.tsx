// @vitest-environment jsdom
//
// LibraryView starred-only quick toggle (#46): the chip next to the density radio drives the
// SAME lifted filters.starredOnly the FilterPanel chip uses (App passes the same callback), so
// these tests assert the presentation contract — chip class from filters.starredOnly, the
// onToggleStarred callback on click, and the icon-only collapse on mobile.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LibraryView } from "./LibraryView";
import type { Content, LibraryFilters, Page } from "../types";

const EMPTY_PAGE: Page<Content> = { items: [], total: 0, limit: 16, offset: 0 };

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
});

function renderLibrary(
  over: { starredOnly?: boolean; mob?: boolean; onToggleStarred?: () => void } = {},
) {
  vi.stubGlobal("IntersectionObserver", NoopIntersectionObserver);
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(new Response(JSON.stringify(EMPTY_PAGE), { status: 200 }))),
  );
  const filters: LibraryFilters = {
    types: [],
    editions: [],
    categories: [],
    starredOnly: over.starredOnly ?? false,
  };
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <LibraryView
        filters={filters}
        density="compact"
        onSetDensity={() => {}}
        onToggleStarred={over.onToggleStarred}
        onClearFilters={() => {}}
        filterCount={0}
        mob={over.mob ?? false}
      />
    </QueryClientProvider>,
  );
}

describe("<LibraryView/> starred quick toggle (#46)", () => {
  it("renders in the header, off by default, and calls onToggleStarred on click", () => {
    const onToggleStarred = vi.fn();
    renderLibrary({ onToggleStarred });

    const toggle = screen.getByRole("button", { name: "Starred only" });
    expect(toggle.className).toBe("rc-chip");
    expect(toggle.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(toggle);
    expect(onToggleStarred).toHaveBeenCalledTimes(1);
  });

  it("shows the rc-chip 'on' state when filters.starredOnly is true", () => {
    renderLibrary({ starredOnly: true });

    const toggle = screen.getByRole("button", { name: "Starred only" });
    expect(toggle.className).toBe("rc-chip on");
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
  });

  it("collapses to icon-only on mobile (label hidden, aria-label kept)", () => {
    renderLibrary({ mob: true });

    const toggle = screen.getByRole("button", { name: "Starred only" });
    expect(toggle.textContent).not.toContain("Starred");
  });
});
