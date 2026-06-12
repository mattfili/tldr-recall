// Library — the whole ingested corpus, browsable + filterable (ADR-0001; NOT only bookmarks).
// Ported from tldr-web/prototype.jsx LibraryView, adapted to REAL paginated data.
//
// Data: useLibrary(filters, pageSize) is a TanStack useInfiniteQuery over GET /library. The
// query is keyed on the filter object, so toggling a filter restarts the paginated query
// automatically — this replaces the prototype's client-side applyFilters + cyclePool. Pages
// are flattened into one list; the live count is the SINGLE envelope `total` (whole-corpus
// when unfiltered, match count when filtered — grilled scope: ONE in-view number).
//
// Density (compact = Titles / expanded = Titles + TLDR) is a presentation pref persisted via
// usePrefs (localStorage), NOT a query param. Infinite scroll uses an IntersectionObserver
// sentinel that calls fetchNextPage() while more pages exist.
//
// recall.css is BYTE-IDENTICAL; the only responsiveness is via `mob` (gutters + collapsed
// right-meta columns), matching EditorialView/TopBar.

import { useEffect, useRef } from "react";
import { useLibrary } from "../api/queries";
import type { Density } from "../usePrefs";
import type { LibraryFilters } from "../types";
import { Ico } from "./atoms";
import { LibraryRow } from "./LibraryRow";

// One page size per density (kept simple): expanded shows fewer, fuller rows.
const PAGE_SIZE: Record<Density, number> = { expanded: 8, compact: 16 };

export function LibraryView({
  filters,
  density,
  onSetDensity,
  onToggleStarred,
  onClearFilters,
  filterCount,
  mob = false,
}: {
  filters: LibraryFilters;
  density: Density;
  onSetDensity: (d: Density) => void;
  onToggleStarred?: () => void;
  onClearFilters: () => void;
  filterCount: number;
  mob?: boolean;
}) {
  const expanded = density === "expanded";
  const query = useLibrary(filters, PAGE_SIZE[density]);
  const { data, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage } = query;

  const items = data?.pages.flatMap((p) => p.items) ?? [];
  // The SINGLE in-view count: the envelope total (same for every page of a given filter set).
  const total = data?.pages[0]?.total ?? 0;

  // Infinite-scroll sentinel: fetch the next page when it scrolls into view.
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { rootMargin: "600px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const empty = !isLoading && items.length === 0;

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: mob ? "0 14px" : "0 28px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 16,
          padding: "30px 8px 14px",
          borderBottom: "1px solid var(--line)",
        }}
      >
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.03em", margin: 0 }}>
            Library
          </h1>
          {/* ONE in-view number: the envelope total (whole-corpus when unfiltered, match count
              when filtered). No separate corpus_total / "N match filters" dual number. */}
          <div style={{ fontSize: 13.5, color: "var(--ink-3)", marginTop: 4 }}>
            <span className="mono" style={{ color: "var(--ink-2)", fontWeight: 600 }}>
              {total.toLocaleString()}
            </span>{" "}
            items
          </div>
        </div>
        <div style={{ flex: 1 }} />
        {/* starred-only quick toggle (#46) — flips the SAME lifted filters.starredOnly the
            FilterPanel chip uses (one source of truth; both stay in sync by construction) */}
        <button
          className={"rc-chip" + (filters.starredOnly ? " on" : "")}
          style={{ fontSize: 12.5, padding: "6px 13px" }}
          onClick={onToggleStarred}
          aria-label="Starred only"
          aria-pressed={filters.starredOnly}
        >
          <Ico name="star" s={14} /> {!mob && "Starred"}
        </button>
        {/* density toggle — persists via usePrefs (localStorage), not a query param */}
        <div
          style={{
            display: "flex",
            gap: 2,
            background: "var(--surface-2)",
            border: "1px solid var(--line)",
            borderRadius: 9,
            padding: 3,
          }}
        >
          {(
            [
              ["compact", "rows", "Titles"],
              ["expanded", "library", "Titles + TLDR"],
            ] as [Density, "rows" | "library", string][]
          ).map(([k, ic, label]) => (
            <button
              key={k}
              onClick={() => onSetDensity(k)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                border: "none",
                cursor: "pointer",
                font: "inherit",
                fontSize: 12.5,
                fontWeight: 600,
                padding: "6px 12px",
                borderRadius: 7,
                background: density === k ? "var(--surface)" : "transparent",
                boxShadow: density === k ? "var(--shadow-sm)" : "none",
                color: density === k ? "var(--ink)" : "var(--ink-3)",
              }}
            >
              <Ico name={ic} s={15} /> {!mob && label}
            </button>
          ))}
        </div>
      </div>

      {!expanded && !empty && (
        <div
          style={{
            display: "flex",
            gap: 16,
            padding: "0 8px",
            height: 34,
            alignItems: "center",
            fontFamily: "var(--mono)",
            fontSize: 10.5,
            fontWeight: 600,
            letterSpacing: ".05em",
            textTransform: "uppercase",
            color: "var(--ink-4)",
            borderBottom: "1px solid var(--line)",
          }}
        >
          <span style={{ width: 16 }} />
          <span style={{ width: 15 }} />
          <span style={{ flex: 1 }}>Title</span>
          {!mob && <span style={{ minWidth: 96, textAlign: "right" }}>Edition</span>}
          <span style={{ minWidth: mob ? 0 : 50, textAlign: "right" }}>Length</span>
        </div>
      )}

      {empty ? (
        <div
          style={{ padding: "70px 0", textAlign: "center", color: "var(--ink-3)", fontSize: 14.5 }}
        >
          No items match these filters.{" "}
          {filterCount > 0 && (
            <button
              onClick={onClearFilters}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                font: "inherit",
                color: "var(--accent)",
                fontWeight: 600,
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      ) : isLoading ? (
        <div style={{ padding: "60px 0", color: "var(--ink-4)", fontSize: 14.5 }}>
          <span className="rc-spin" style={{ marginRight: 10 }} />
          Loading…
        </div>
      ) : (
        <>
          <div>
            {items.map((it) => (
              <LibraryRow key={it.id} it={it} expanded={expanded} mob={mob} />
            ))}
          </div>
          {hasNextPage && (
            <div
              ref={sentinel}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                padding: "28px 0 70px",
                color: "var(--ink-4)",
                fontSize: 13,
              }}
            >
              {isFetchingNextPage && (
                <>
                  <span className="rc-spin" /> Loading more
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
