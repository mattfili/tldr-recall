// LibraryRow — one row in the Library list. Ported from tldr-web/prototype.jsx LibraryRow,
// adapted to the real Content shape.
//
// Field mapping (prototype -> Content):
//  - it.src        -> it.content_type   (SrcIcon kind)
//  - it.sum        -> it.summary
//  - it.read       -> it.read_minutes
//  - it.ed (ED map)-> it.edition.name   (the PRIMARY appearance's edition per ADR-0001;
//                                         no ED lookup — Content already carries it flat)
//  - it.read_state -> it.read_state     (title font-weight only; PRESENTATION, not a filter)
//
// Links open via platform.openExternal (matches ContentItem; the prototype used a raw href).
// Star RENDERS it.starred and is non-functional (writes are #5), like ContentItem.
// On mobile the right-side Edition/Length meta collapses (hide Edition, keep Length) so the
// fixed-width columns don't overflow — gated by the `mob` prop (recall.css is never edited).

import { useState } from "react";
import { platform } from "../platform";
import type { Content } from "../types";
import { Ico, ResourcePill, SrcIcon, Star } from "./atoms";
import { SharePop } from "./SharePop";

// star + share action cluster, mirroring ContentItem's read-only Actions (writes are #5).
function RowActions({ it, size = 17 }: { it: Content; size?: number }) {
  const [shareOpen, setShareOpen] = useState(false);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, position: "relative" }}>
      <Star on={it.starred} size={size} />
      <div style={{ position: "relative" }}>
        <button
          onClick={() => setShareOpen((o) => !o)}
          aria-label="share"
          data-share
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 4,
            color: "var(--ink-4)",
            display: "inline-flex",
            transition: "color .12s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--ink-2)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--ink-4)")}
        >
          <Ico name="share" s={size - 2} />
        </button>
        {shareOpen && <SharePop onClose={() => setShareOpen(false)} />}
      </div>
    </div>
  );
}

export function LibraryRow({
  it,
  expanded,
  mob = false,
}: {
  it: Content;
  expanded: boolean;
  mob?: boolean;
}) {
  const unread = it.read_state === "unread";
  const lengthLabel = it.read_minutes ? `${it.read_minutes} min` : it.content_type;

  const openArticle = (e: React.MouseEvent) => {
    e.preventDefault();
    platform.openExternal(it.url);
  };

  return (
    <div
      style={{
        display: "flex",
        gap: 16,
        padding: expanded ? "18px 8px" : "0 8px",
        minHeight: expanded ? 0 : 48,
        alignItems: expanded ? "flex-start" : "center",
        borderBottom: "1px solid var(--line-2)",
      }}
    >
      <div style={{ paddingTop: expanded ? 2 : 0 }}>
        <Star on={it.starred} size={16} />
      </div>
      <span style={{ color: "var(--ink-4)", flex: "none", paddingTop: expanded ? 3 : 0 }}>
        <SrcIcon kind={it.content_type} s={15} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <a
            href={it.url}
            onClick={openArticle}
            style={{
              fontSize: expanded ? 16.5 : 14,
              fontWeight: unread ? 600 : 500,
              color: unread ? "var(--ink)" : "var(--ink-2)",
              textDecoration: "none",
              letterSpacing: "-0.01em",
              whiteSpace: expanded ? "normal" : "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              textWrap: expanded ? "balance" : "nowrap",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
            onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
          >
            {it.title}
          </a>
        </div>
        {expanded && (
          <>
            <p
              style={{
                fontSize: 14,
                lineHeight: 1.55,
                color: "var(--ink-2)",
                margin: "7px 0 10px",
                maxWidth: 680,
                textWrap: "pretty",
              }}
            >
              {it.summary}
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span className="mono" style={{ fontSize: 11, color: "var(--ink-4)" }}>
                {it.domain}
              </span>
              {it.resources &&
                it.resources.slice(0, 1).map((r, i) => <ResourcePill key={i} r={r} />)}
            </div>
          </>
        )}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          flex: "none",
          paddingTop: expanded ? 2 : 0,
        }}
      >
        {/* Edition column overflows on phones — hidden on mobile, kept on desktop. */}
        {!mob && (
          <span
            className="mono"
            style={{ fontSize: 11, color: "var(--ink-3)", minWidth: 96, textAlign: "right" }}
          >
            {it.edition.name}
          </span>
        )}
        <span
          className="mono"
          style={{
            fontSize: 11,
            color: "var(--ink-4)",
            minWidth: mob ? 0 : 50,
            textAlign: "right",
          }}
        >
          {lengthLabel}
        </span>
        {expanded && <RowActions it={it} size={17} />}
      </div>
    </div>
  );
}
