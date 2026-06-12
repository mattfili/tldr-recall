// Share popover, ported from tldr-web/prototype.jsx SharePop — made REAL in #39.
// Outside-click closes it. The share target is the article's resolved URL (no
// in-app deep links exist in v1).
//
// Per-target behavior (#39):
//  - Copy link  -> clipboard write (navigator.clipboard, execCommand fallback) +
//                  transient "Copied!".
//  - Email      -> mailto: draft (subject = title, body = url) via
//                  platform.openMailto — web navigates, desktop goes through the
//                  validated system-open IPC (shell.openExternal, mailto:-only,
//                  NEVER the in-app WebContentsView). A stale desktop shell has
//                  no platform.openMailto and gets the copy fallback instead.
// (iMessage/Slack were dropped 2026-06-12 as redundant — both were copy
// fallbacks anyway; Copy link covers them.)
//
// Every target fires the typed article_shared event (#39) through the analytics
// seam (no-op without key/consent, like every #24 event).

import { useEffect, useState } from "react";
import { analytics, type SourceView } from "../analytics";
import { platform } from "../platform";
import type { Content } from "../types";
import { Ico } from "./atoms";
import type { IcoName } from "./atoms";

type ShareTarget = "email" | "copy_link";

const TARGETS: [IcoName, string, ShareTarget][] = [
  ["mail", "Email", "email"],
  ["link", "Copy link", "copy_link"],
];

/**
 * Copy `text` to the clipboard: navigator.clipboard first, hidden-textarea
 * execCommand("copy") when the async API is unavailable or rejects. Best-effort
 * — never throws into the popover.
 */
async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    // clipboard API unavailable (older WebViews) or permission-rejected — fall through.
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  } catch {
    // nothing left to try — the "Copied!" hint stays best-effort.
  }
}

export function SharePop({
  content,
  sourceView,
  onClose,
}: {
  content: Content;
  /** Which surface the popover renders in (#24/#39 analytics). */
  sourceView: SourceView;
  onClose: () => void;
}) {
  // Which row is showing its transient "Copied!" state (any copy-fallback row).
  const [copiedTarget, setCopiedTarget] = useState<IcoName | null>(null);

  useEffect(() => {
    const off = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target?.closest("[data-share]")) onClose();
    };
    document.addEventListener("pointerdown", off, true);
    return () => document.removeEventListener("pointerdown", off, true);
  }, [onClose]);

  const copyWithHint = (ic: IcoName) => {
    void copyText(content.url);
    setCopiedTarget(ic);
    setTimeout(onClose, 650);
  };

  const share = (ic: IcoName, target: ShareTarget) => {
    analytics.capture("article_shared", {
      content_id: content.id,
      content_type: content.content_type,
      domain: content.domain,
      edition: content.edition.key,
      category: content.category?.slug ?? null,
      source_view: sourceView,
      target,
    });
    if (target === "email") {
      const mailto = `mailto:?subject=${encodeURIComponent(content.title)}&body=${encodeURIComponent(content.url)}`;
      if (platform.openMailto) {
        platform.openMailto(mailto);
        onClose();
      } else {
        // Stale desktop shell without the system-open bridge: documented copy fallback.
        copyWithHint(ic);
      }
      return;
    }
    copyWithHint(ic); // copy_link

  };

  return (
    <div
      data-share
      style={{
        position: "absolute",
        top: "100%",
        right: 0,
        marginTop: 6,
        zIndex: 30,
        background: "var(--surface)",
        border: "1px solid var(--line)",
        borderRadius: "var(--r-md)",
        boxShadow: "var(--shadow-lg)",
        padding: 5,
        minWidth: 168,
      }}
    >
      {TARGETS.map(([ic, label, target]) => (
        <button
          key={ic}
          onClick={() => share(ic, target)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 11,
            width: "100%",
            padding: "9px 11px",
            border: "none",
            background: "transparent",
            borderRadius: 7,
            cursor: "pointer",
            font: "inherit",
            fontSize: 13.5,
            fontWeight: 500,
            color: "var(--ink)",
            textAlign: "left",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <span style={{ color: "var(--ink-3)" }}>
            <Ico name={copiedTarget === ic ? "check" : ic} s={17} />
          </span>
          {copiedTarget === ic ? "Copied!" : label}
        </button>
      ))}
    </div>
  );
}
