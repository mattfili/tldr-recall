// ContentItem — one article row in the Editorial view.
// Ported from tldr-web/prototype.jsx ArticleItem + Actions.
//
// Scope notes:
//  - Article links open in a NEW TAB via platform.openExternal.
//  - Star is wired to useToggleSave (#5): the optimistic cache flip updates it.starred
//    immediately, so the fill toggles with no local component state.
//  - read-time / SrcBadge: articles & papers show "(N min read)"; other source
//    types show "(<source label>)" (matches the prototype's SRC_NAME copy).

import { useState } from "react";
import { useToggleSave } from "../api/queries";
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

// star + share action cluster. The Star toggles the Save via useToggleSave (#5).
function Actions({ it, size = 19 }: { it: Content; size?: number }) {
  const [shareOpen, setShareOpen] = useState(false);
  const toggle = useToggleSave();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, position: "relative" }}>
      <Star
        on={it.starred}
        size={size}
        onClick={() => toggle.mutate({ id: it.id, next: !it.starred })}
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
        {shareOpen && <SharePop onClose={() => setShareOpen(false)} />}
      </div>
    </div>
  );
}

export function ContentItem({ it }: { it: Content }) {
  const openArticle = (e: React.MouseEvent) => {
    e.preventDefault();
    platform.openExternal(it.url);
  };

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
          {it.resources && it.resources.map((r, i) => <ResourcePill key={i} r={r} />)}
        </div>
        <Actions it={it} />
      </div>
    </article>
  );
}
