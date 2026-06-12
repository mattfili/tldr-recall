// @vitest-environment jsdom
//
// ContentItem analytics wiring (#24): opening the title link fires article_open with the
// PRIMARY appearance's edition key + category slug and source_view defaulting to
// "editorial" (EditorialView passes nothing). The optional sourceView/onOpen props feed
// the search surface (covered in SearchView.test.tsx). The analytics module is mocked —
// no SDK, no network.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ContentItem } from "./ContentItem";
import type { Content } from "../types";

const analyticsMock = vi.hoisted(() => ({ capture: vi.fn() }));
vi.mock("../analytics", () => ({ analytics: analyticsMock }));

const IT: Content = {
  id: "11111111-1111-1111-1111-111111111111",
  title: "Headroom — agent context compression",
  summary: "Compresses everything an agent reads.",
  content_type: "repo",
  read_minutes: null,
  url: "https://github.com",
  domain: "github.com",
  tags: ["agents"],
  resources: null,
  edition: { key: "tldr", name: "TLDR" },
  category: { slug: "tools", label: "Tools", hue: "var(--c-tools)" },
  issue: { id: "iss", issue_number: "#1", published_at: "2026-06-02" },
  appearances: [],
  starred: false,
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  analyticsMock.capture.mockClear();
});

// ContentItem's Actions use useToggleSave, so it needs a QueryClientProvider.
function renderItem(it: Content, props: { showEditions?: boolean } = {}) {
  vi.stubGlobal("open", vi.fn()); // platform.openExternal → window.open
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ContentItem it={it} {...props} />
    </QueryClientProvider>,
  );
}

/** Local 'YYYY-MM-DD' for `n` days before today (deterministic recency, no fake timers). */
function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

describe("<ContentItem/> share threading (#39)", () => {
  it("opening the share popover and clicking Copy link fires article_shared with source_view 'editorial'", async () => {
    // SharePop needs the Content + sourceView threaded through Actions — this proves it.
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderItem(IT);

    fireEvent.click(screen.getByRole("button", { name: "share" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));

    expect(writeText).toHaveBeenCalledWith(IT.url);
    expect(analyticsMock.capture).toHaveBeenCalledWith("article_shared", {
      content_id: IT.id,
      content_type: "repo",
      domain: "github.com",
      edition: "tldr",
      category: "tools",
      source_view: "editorial",
      target: "copy_link",
    });
    Reflect.deleteProperty(navigator, "clipboard");
  });
});

describe("<ContentItem/> search metadata (#42)", () => {
  it("renders edition + recency for a single-appearance item when showEditions is set", () => {
    const it3d = {
      ...IT,
      issue: { ...IT.issue, published_at: isoDaysAgo(3) },
      appearances: [
        {
          issue: { ...IT.issue, published_at: isoDaysAgo(3) },
          edition: IT.edition,
          category: IT.category,
          position: 0,
        },
      ],
    };
    renderItem(it3d, { showEditions: true });
    expect(screen.getByText("TLDR · 3d ago")).toBeTruthy();
  });

  it("renders NO edition/recency text by default (Editorial surface unchanged)", () => {
    renderItem({ ...IT, issue: { ...IT.issue, published_at: isoDaysAgo(3) } });
    expect(screen.queryByText(/TLDR/)).toBeNull();
    expect(screen.queryByText(/3d ago/)).toBeNull();
  });
});

describe("<ContentItem/> analytics (#24)", () => {
  it("opening the title fires article_open with source_view 'editorial' by default", () => {
    renderItem(IT);
    fireEvent.click(screen.getByRole("link", { name: IT.title }));

    expect(analyticsMock.capture).toHaveBeenCalledTimes(1);
    expect(analyticsMock.capture).toHaveBeenCalledWith("article_open", {
      content_id: IT.id,
      content_type: "repo",
      domain: "github.com",
      edition: "tldr",
      category: "tools",
      source_view: "editorial",
    });
  });

  it("sends category: null when the Content has no category", () => {
    renderItem({ ...IT, category: null });
    fireEvent.click(screen.getByRole("link", { name: IT.title }));

    expect(analyticsMock.capture).toHaveBeenCalledWith(
      "article_open",
      expect.objectContaining({ category: null }),
    );
  });
});
