// ContentItem — one article row in the Editorial view (also reused by SearchView for hits).
// Ported from tldr-web/prototype.jsx ArticleItem + Actions.
//
// Scope notes:
//  - Article links open in a NEW TAB via platform.openExternal.
//  - Star is wired to useToggleSave (#5): the optimistic cache flip updates it.starred
//    immediately, so the fill toggles with no local component state.
//  - read-time / SrcBadge: articles & papers show "(N min read)"; other source
//    types show "(<source label>)" (matches the prototype's SRC_NAME copy).
//  - `showEditions` (#27 -> #42, ADR-0001): when true (SearchView is the only caller),
//    the metadata cluster shows the deduped primary-first edition list (#27 ordering)
//    PLUS relative recency from the primary appearance's issue date — e.g.
//    "TLDR · AI · 3d ago" — rendered UNCONDITIONALLY (#42 superseded the old >1-editions
//    gate on the search surface). Default false so the Editorial view is untouched.

import { useState } from "react";
import { analytics, type SourceView } from "../analytics";
import { useToggleSave } from "../api/queries";
import { editionNames, formatRecency } from "../format";
import { platform } from "../platform";
import type { Content } from "../types";
import { FaviconChip, Ico, ResourcePill, Star } from "./atoms";
import { SharePop } from "./SharePop";

const SRC_NAME: Record<string, string> = {
  repo: "GitHub repo",
  website: "website",
  substack: "Substack",
  paper: "paper",
  article: "read",
};

function metaLabel(c: Content): string {
  if (c.read_minutes) return `(${c.read_minutes} min read)`;
  return `(${SRC_NAME[c.content_type] ?? c.content_type})`;
}

// star + share action cluster. The Star toggles the Save via useToggleSave (#5);
// the share popover gets the Content + surface so its targets are real (#39).
function Actions({
  it,
  sourceView,
  size = 19,
}: {
  it: Content;
  sourceView: SourceView;
  size?: number;
}) {
  const [shareOpen, setShareOpen] = useState(false);
  const toggle = useToggleSave();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, position: "relative" }}>
      <Star
        on={it.starred}
        size={size}
        onClick={() =>
          toggle.mutate({ id: it.id, next: !it.starred, contentType: it.content_type })
        }
      />
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
        {shareOpen && (
          <SharePop content={it} sourceView={sourceView} onClose={() => setShareOpen(false)} />
        )}
      </div>
    </div>
  );
}

export function ContentItem({
  it,
  showEditions = false,
  sourceView = "editorial",
  onOpen,
}: {
  it: Content;
  showEditions?: boolean;
  /** Which surface this row renders in (#24 analytics) — Editorial by default. */
  sourceView?: SourceView;
  /** Extra open hook (#24): SearchView uses it to fire result_open alongside article_open. */
  onOpen?: () => void;
}) {
  const openArticle = (e: React.MouseEvent) => {
    e.preventDefault();
    analytics.capture("article_open", {
      content_id: it.id,
      content_type: it.content_type,
      domain: it.domain,
      edition: it.edition.key,
      category: it.category?.slug ?? null,
      source_view: sourceView,
    });
    onOpen?.();
    platform.openExternal(it.url);
  };
  const editions = showEditions ? editionNames(it) : [];

  return (
    <article style={{ padding: "22px 0", borderBottom: "1px solid var(--line-2)" }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 11,
          flexWrap: "wrap",
          marginBottom: 9,
        }}
      >
        <a
          href={it.url}
          onClick={openArticle}
          style={{
            fontSize: 21,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            lineHeight: 1.24,
            color: "var(--ink)",
            textDecoration: "none",
            textWrap: "balance",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
          onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
        >
          {it.title}
        </a>
        <span className="mono" style={{ fontSize: 12, color: "var(--ink-3)", whiteSpace: "nowrap" }}>
          {metaLabel(it)}
        </span>
      </div>
      <p
        style={{
          fontSize: 16,
          lineHeight: 1.62,
          color: "var(--ink-2)",
          margin: "0 0 14px",
          maxWidth: 648,
          textWrap: "pretty",
        }}
      >
        {it.summary}
      </p>
      <div
        style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between" }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            minWidth: 0,
            flexWrap: "wrap",
          }}
        >
          <FaviconChip domain={it.domain} size={18} />
          <span className="mono" style={{ fontSize: 12, color: "var(--ink-4)" }}>
            {it.domain}
          </span>
          {/* Search metadata (#42, supersedes the #27 >1-editions gate on this surface):
              edition(s) — primary first, deduped (#27 semantics) — plus recency from the
              primary appearance's issue date, in the same light mono idiom as the domain.
              editions is non-empty iff showEditions (the primary edition always exists). */}
          {editions.length > 0 && (
            <span
              className="mono"
              style={{ fontSize: 12, color: "var(--ink-4)", whiteSpace: "nowrap" }}
            >
              {[...editions, formatRecency(it.issue.published_at)].join(" · ")}
            </span>
          )}
          {it.resources && it.resources.map((r, i) => <ResourcePill key={i} r={r} />)}
        </div>
        <Actions it={it} sourceView={sourceView} />
      </div>
    </article>
  );
}
