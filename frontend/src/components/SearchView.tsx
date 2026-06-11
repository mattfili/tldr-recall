// Unified hybrid search (#7, spec §8, ADR-0001/0002/0003).
// Ported from tldr-web/prototype.jsx SearchView (~line 444), adapted to REAL data via useSearch
// (replacing the prototype's client-side runSearch). One search box over the WHOLE Library;
// results are one-per-story canonical Content reused through <ContentItem/>.
//
// GRILLED SCOPE: the prototype's "open-weights … haven't read" suggestion is DROPPED (ADR-0002 —
// no read cue). match_explanation rides on each hit but is NEVER rendered (hidden in the UI).
//
// recall.css is BYTE-IDENTICAL: responsiveness is ONLY via the `mob` prop + inline styles
// (full-width input/results, shortened placeholder on mobile), matching the other views.

import { useEffect, useMemo, useRef, useState } from "react";
import { useCollections, useSearch } from "../api/queries";
import type { SearchFilters } from "../types";
import { Ico } from "./atoms";
import { ContentItem } from "./ContentItem";

const PAGE_SIZE = 12;

// Static "try asking" suggestions. The "haven't read" suggestion is intentionally absent
// (ADR-0002 removed the read cue). These map to the documented success queries.
const SUGGEST: string[] = [
  "github repos about agents",
  "everything about IPOs and going public",
  "papers about retrieval",
];

const PLACEHOLDER = "Ask your library in plain English…";
const PLACEHOLDER_MOBILE = "Ask your library…";

export function SearchView({
  query,
  onSetQuery,
  filters,
  mob = false,
}: {
  query: string;
  onSetQuery: (q: string) => void;
  filters?: SearchFilters;
  mob?: boolean;
}) {
  const [draft, setDraft] = useState(query);
  const [submitted, setSubmitted] = useState(query);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const searchQuery = useSearch(submitted, filters, PAGE_SIZE);
  const { data, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage } = searchQuery;
  const collectionsQuery = useCollections();
  const collections = useMemo(() => collectionsQuery.data ?? [], [collectionsQuery.data]);

  const items = data?.pages.flatMap((p) => p.items) ?? [];
  const total = data?.pages[0]?.total ?? 0;

  // Infinite-scroll sentinel — same IntersectionObserver idiom as LibraryView.
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

  const submit = (val?: string) => {
    const v = val ?? draft;
    setDraft(v);
    setSubmitted(v);
    onSetQuery(v);
  };

  const clear = () => {
    setDraft("");
    setSubmitted("");
    onSetQuery("");
    inputRef.current?.focus();
  };

  const hasSubmitted = submitted.trim().length > 0;
  const empty = hasSubmitted && !isLoading && items.length === 0;

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: mob ? "0 14px" : "0 28px" }}>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <div style={{ width: 700, maxWidth: "100%", padding: mob ? "24px 0 70px" : "38px 0 90px" }}>
          {/* unified input */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 13,
              background: "var(--surface)",
              border: "1.5px solid var(--ink)",
              borderRadius: 14,
              padding: "15px 18px",
              boxShadow: "var(--shadow-md)",
            }}
          >
            <span style={{ color: "var(--accent)" }}>
              <Ico name="spark" s={21} />
            </span>
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
              placeholder={mob ? PLACEHOLDER_MOBILE : PLACEHOLDER}
              aria-label="Search your library"
              style={{
                flex: 1,
                minWidth: 0,
                border: "none",
                outline: "none",
                background: "transparent",
                font: "inherit",
                fontSize: 16.5,
                fontWeight: 500,
                color: "var(--ink)",
              }}
            />
            {draft && (
              <button
                onClick={clear}
                aria-label="clear"
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--ink-4)",
                  display: "inline-flex",
                }}
              >
                <Ico name="x" s={18} />
              </button>
            )}
            <button
              className="rc-btn primary"
              onClick={() => submit()}
              aria-label="search"
              style={{ padding: "9px", borderRadius: 10, width: 38, height: 38, flex: "none" }}
            >
              <Ico name="arrow" s={18} />
            </button>
          </div>

          {!hasSubmitted ? (
            <div style={{ marginTop: 26 }}>
              <div
                className="mono"
                style={{
                  fontSize: 11,
                  color: "var(--ink-4)",
                  letterSpacing: ".05em",
                  marginBottom: 12,
                }}
              >
                TRY ASKING
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {SUGGEST.map((s) => (
                  <SuggestRow key={s} label={s} onClick={() => submit(s)} />
                ))}
              </div>

              {collections.length > 0 && (
                <div style={{ marginTop: 28 }}>
                  <div
                    className="mono"
                    style={{
                      fontSize: 11,
                      color: "var(--ink-4)",
                      letterSpacing: ".05em",
                      marginBottom: 12,
                    }}
                  >
                    SMART COLLECTIONS
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {collections.map((c) => (
                      <button
                        key={c.slug}
                        onClick={() => submit(c.query)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 7,
                          padding: "7px 13px",
                          borderRadius: 999,
                          border: "1px solid var(--line)",
                          background: "var(--surface-2)",
                          cursor: "pointer",
                          font: "inherit",
                          fontSize: 13,
                          fontWeight: 600,
                          color: "var(--ink-2)",
                        }}
                      >
                        <span style={{ color: c.hue, fontSize: 16, lineHeight: 0 }}>•</span>
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ marginTop: 24 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 10,
                  paddingBottom: 8,
                  borderBottom: "1px solid var(--line)",
                  flexWrap: "wrap",
                }}
              >
                <span style={{ fontSize: 14, fontWeight: 700 }}>
                  {total} result{total === 1 ? "" : "s"}
                </span>
                <span style={{ fontSize: 13, color: "var(--ink-3)" }}>
                  ranked by meaning across your library
                </span>
              </div>

              {empty ? (
                <div
                  style={{
                    padding: "60px 0",
                    textAlign: "center",
                    color: "var(--ink-3)",
                    fontSize: 14.5,
                  }}
                >
                  Nothing matched. Try fewer or different words.
                </div>
              ) : isLoading ? (
                <div style={{ padding: "60px 0", color: "var(--ink-4)", fontSize: 14.5 }}>
                  <span className="rc-spin" style={{ marginRight: 10 }} />
                  Searching…
                </div>
              ) : (
                <>
                  {/* SearchHit is a Content superset — ContentItem renders a hit unchanged.
                      showEditions adds the additive multi-edition provenance badge
                      (#27, ADR-0001) when a hit appeared in more than one edition. */}
                  {items.map((hit) => (
                    <ContentItem key={hit.id} it={hit} showEditions />
                  ))}
                  {hasNextPage && (
                    <div
                      ref={sentinel}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 10,
                        padding: "24px 0",
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
          )}
        </div>
      </div>
    </div>
  );
}

function SuggestRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "13px 6px",
        border: "none",
        borderBottom: "1px solid var(--line-2)",
        background: "transparent",
        cursor: "pointer",
        font: "inherit",
        textAlign: "left",
        color: "var(--ink-2)",
        fontSize: 15.5,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.color = "var(--ink)")}
      onMouseLeave={(e) => (e.currentTarget.style.color = "var(--ink-2)")}
    >
      <span style={{ color: "var(--ink-4)" }}>
        <Ico name="search" s={16} />
      </span>
      {label}
    </button>
  );
}
