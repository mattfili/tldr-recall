// @vitest-environment jsdom
//
// Unit tests for the #5 optimistic Save mutation (useToggleSave) — the core mechanism of
// the issue. saves.test.ts covers the client fns (URL/parse); these cover the cache logic:
// the optimistic `starred` flip across a cached library page, and ROLLBACK when the server
// call fails (the subtle path the browser happy-path can't exercise).

import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider, type InfiniteData } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { useToggleSave } from "./queries";
import { queryKeys } from "./queries";
import type { Content, Page } from "../types";

// #24: mock the analytics seam — useToggleSave's onMutate is the single save_toggled
// capture point for every Star call site.
const analyticsMock = vi.hoisted(() => ({ capture: vi.fn() }));
vi.mock("../analytics", () => ({ analytics: analyticsMock }));

const CID = "91b6b997-fe16-4e09-b07c-4119ceaaf241";

function content(starred: boolean): Content {
  return {
    id: CID,
    title: "Test Story",
    summary: "Summary",
    content_type: "article",
    read_minutes: 5,
    url: "https://example.com",
    domain: "example.com",
    tags: [],
    resources: null,
    edition: { key: "tldr", name: "TLDR" },
    category: null,
    issue: { id: "issue-1", issue_number: "#1", published_at: "2026-01-01" },
    appearances: [],
    starred,
  };
}

function libraryData(starred: boolean): InfiniteData<Page<Content>> {
  return { pages: [{ items: [content(starred)], total: 1, limit: 16, offset: 0 }], pageParams: [0] };
}

// A QueryClient with retry off so a failed mutation/refetch settles immediately.
function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function starredInCache(qc: QueryClient, filters: Parameters<typeof queryKeys.library>[0]): boolean {
  const data = qc.getQueryData<InfiniteData<Page<Content>>>(queryKeys.library(filters));
  return data!.pages[0].items[0].starred;
}

afterEach(() => {
  vi.restoreAllMocks();
  analyticsMock.capture.mockClear();
});

const FILTERS = { types: [], editions: [], categories: [], starredOnly: false };

describe("useToggleSave (optimistic)", () => {
  it("optimistically flips starred=true in the cached library page on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response(JSON.stringify({ content_id: CID, starred: true }), { status: 200 }))),
    );
    const qc = makeClient();
    qc.setQueryData(queryKeys.library(FILTERS), libraryData(false));
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useToggleSave(), { wrapper });

    result.current.mutate({ id: CID, next: true, contentType: "article" });
    // optimistic: cache flips before the network settles
    await waitFor(() => expect(starredInCache(qc, FILTERS)).toBe(true));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(starredInCache(qc, FILTERS)).toBe(true);
  });

  it("rolls back the optimistic flip when the server call fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("nope", { status: 500 }))),
    );
    const qc = makeClient();
    qc.setQueryData(queryKeys.library(FILTERS), libraryData(false)); // starts unstarred
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useToggleSave(), { wrapper });

    result.current.mutate({ id: CID, next: true, contentType: "article" });
    await waitFor(() => expect(result.current.isError).toBe(true));
    // onError must restore the snapshot: starred is back to false (no phantom star).
    expect(starredInCache(qc, FILTERS)).toBe(false);
  });

  it("fires save_toggled 'on' / 'off' with the content_type (#24)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ content_id: CID, starred: true }), { status: 200 }),
        ),
      ),
    );
    const qc = makeClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useToggleSave(), { wrapper });

    result.current.mutate({ id: CID, next: true, contentType: "repo" });
    await waitFor(() =>
      expect(analyticsMock.capture).toHaveBeenCalledWith("save_toggled", {
        content_id: CID,
        content_type: "repo",
        state: "on",
      }),
    );

    result.current.mutate({ id: CID, next: false, contentType: "repo" });
    await waitFor(() =>
      expect(analyticsMock.capture).toHaveBeenCalledWith("save_toggled", {
        content_id: CID,
        content_type: "repo",
        state: "off",
      }),
    );
  });
});
