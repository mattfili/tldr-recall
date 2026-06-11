// @vitest-environment jsdom
//
// Render test for LibraryRow's edition column (#27, ADR-0001): multi-appearance Content shows
// every edition it appeared in ("TLDR · AI"), duplicate same-edition sightings dedupe to one
// entry, and single-appearance Content renders exactly as before ("TLDR").

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LibraryRow } from "./LibraryRow";
import type { Appearance, Content, EditionRef } from "../types";

const TLDR: EditionRef = { key: "tldr", name: "TLDR" };
const AI: EditionRef = { key: "ai", name: "AI" };

function appearance(edition: EditionRef, issueId: string): Appearance {
  return {
    issue: { id: issueId, issue_number: "#1", published_at: "2026-06-02" },
    edition,
    category: { slug: "tools", label: "Tools", hue: "var(--c-tools)" },
    position: 0,
  };
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

afterEach(cleanup);

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
