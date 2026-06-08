// Recall — shared UI atoms, ported faithfully from tldr-web/ui.jsx to typed TSX.
// Same SVG paths and class names (rc-src, rc-cat, rc-dot, rc-star, rc-logo, …).

import type { CategoryRef, Resource } from "../types";

// ── source-type kinds (content_type values from the API contract) ──
export type SrcKind = "article" | "repo" | "website" | "substack" | "paper" | string;

// ── source-type icon (simple original glyphs, not brand logos) ──
export function SrcIcon({ kind, s = 12 }: { kind: SrcKind; s?: number }) {
  const sw = 1.6;
  const p = {
    width: s,
    height: s,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: sw,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (kind) {
    case "repo":
      return (
        <svg {...p}>
          <path d="M5.5 5.5L3 8l2.5 2.5M10.5 5.5L13 8l-2.5 2.5M9 4l-2 8" />
        </svg>
      );
    case "website":
      return (
        <svg {...p}>
          <circle cx="8" cy="8" r="5.4" />
          <path d="M2.6 8h10.8M8 2.6c1.5 1.6 1.5 9.2 0 10.8M8 2.6C6.5 4.2 6.5 11.8 8 13.4" />
        </svg>
      );
    case "substack":
      return (
        <svg {...p} fill="currentColor" stroke="none">
          <rect x="3" y="3.2" width="10" height="1.7" rx=".4" />
          <rect x="3" y="6.6" width="10" height="1.7" rx=".4" />
          <path d="M3 10h10v3.2L8 11.2 3 13.2z" />
        </svg>
      );
    case "paper":
      return (
        <svg {...p}>
          <path d="M4 2.5h5L12 5.5V13.5H4z" />
          <path d="M8.6 2.6V6h3.2M6 8.5h4M6 10.7h4" />
        </svg>
      );
    default:
      return (
        <svg {...p}>
          <rect x="3" y="3" width="10" height="10" rx="1.4" />
          <path d="M5.4 6.2h5.2M5.4 8.4h5.2M5.4 10.6h3" />
        </svg>
      );
  }
}

const SRC_LABEL: Record<string, string> = {
  repo: "repo",
  website: "site",
  substack: "substack",
  paper: "paper",
  article: "read",
};

export function SrcBadge({
  kind,
  read,
  size = 11,
}: {
  kind: SrcKind;
  read?: number | null;
  size?: number;
}) {
  const label =
    kind === "article" || kind === "paper"
      ? read
        ? read + " min"
        : SRC_LABEL[kind]
      : SRC_LABEL[kind] || kind;
  const cls = kind === "repo" ? "is-repo" : kind === "paper" ? "is-paper" : "";
  return (
    <span className={"rc-src " + cls} style={{ fontSize: size, padding: "3px 8px", gap: 5 }}>
      <SrcIcon kind={kind} s={size + 1} /> {label}
    </span>
  );
}

// ── category dot + optional label ──
// `hue` is the CategoryRef.hue value verbatim (e.g. "var(--c-bigtech)").
export function Cat({
  category,
  showLabel = true,
  size = 8,
}: {
  category: CategoryRef | null;
  showLabel?: boolean;
  size?: number;
}) {
  const hue = category?.hue ?? "var(--ink-4)";
  const label = category?.label ?? "—";
  return (
    <span className="rc-cat" style={{ fontSize: 12.5 }}>
      <span className="rc-dot" style={{ background: hue, width: size, height: size }} />
      {showLabel && label}
    </span>
  );
}

// ── star / favorite ──
export function Star({
  on,
  size = 18,
  onClick,
}: {
  on: boolean;
  size?: number;
  onClick?: () => void;
}) {
  return (
    <button className={"rc-star" + (on ? " on" : "")} onClick={onClick} aria-label="favorite">
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={on ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      >
        <path d="M12 2.6l2.7 5.9 6.4.7-4.8 4.3 1.4 6.3L12 16.9 6.3 19.8l1.4-6.3L2.9 9.2l6.4-.7z" />
      </svg>
    </button>
  );
}

// ── logo wordmark (original treatment on TLDR palette) ──
export function Logo({ size = 18, mark = true }: { size?: number; mark?: boolean }) {
  return (
    <span className="rc-logo" style={{ fontSize: size }}>
      {mark && (
        <span
          className="mark"
          style={{
            width: size * 1.55,
            height: size * 1.15,
            fontSize: size * 0.62,
            borderRadius: size * 0.32,
          }}
        >
          TL;DR
        </span>
      )}
      <span>Recall</span>
    </span>
  );
}

// ── domain favicon stand-in (monospace initial chip) ──
export function FaviconChip({ domain, size = 18 }: { domain: string; size?: number }) {
  const ch = (domain || "?")
    .replace(/^github\.com\//, "")
    .replace(/^www\./, "")[0]
    .toUpperCase();
  return (
    <span
      className="mono"
      style={{
        width: size,
        height: size,
        borderRadius: 5,
        flex: "none",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--surface-2)",
        border: "1px solid var(--line)",
        color: "var(--ink-3)",
        fontSize: size * 0.5,
        fontWeight: 600,
      }}
    >
      {ch}
    </span>
  );
}

// ── resource pill (extracted repo/demo/paper) ──
export function ResourcePill({ r }: { r: Resource }) {
  return (
    <span
      className="rc-src"
      style={{ fontSize: 11, padding: "3px 9px 3px 7px", gap: 6, background: "var(--surface-2)" }}
    >
      <SrcIcon kind={r.k} s={12} />
      <span style={{ fontFamily: "var(--mono)", fontWeight: 500 }}>{r.label}</span>
      {r.meta && (
        <span style={{ color: "var(--ink-4)", fontFamily: "var(--mono)" }}>· {r.meta}</span>
      )}
    </span>
  );
}

// ── small icon set used across chrome ──
export type IcoName =
  | "search"
  | "spark"
  | "inbox"
  | "library"
  | "star"
  | "share"
  | "filter"
  | "grid"
  | "rows"
  | "tag"
  | "check"
  | "mail"
  | "message"
  | "slack"
  | "link"
  | "cmd"
  | "arrow"
  | "plus"
  | "clock"
  | "chevron"
  | "down"
  | "sun"
  | "moon"
  | "user"
  | "x"
  | "sort";

export function Ico({ name, s = 16, sw = 1.7 }: { name: IcoName; s?: number; sw?: number }) {
  const p = {
    width: s,
    height: s,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: sw,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "search":
      return (
        <svg {...p}>
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.2-3.2" />
        </svg>
      );
    case "spark":
      return (
        <svg {...p}>
          <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M18 6l-2.5 2.5M8.5 15.5L6 18" />
        </svg>
      );
    case "inbox":
      return (
        <svg {...p}>
          <path d="M3 13h4l2 3h6l2-3h4" />
          <path d="M5 5h14l2 8v6H3v-6z" />
        </svg>
      );
    case "library":
      return (
        <svg {...p}>
          <rect x="4" y="3" width="5" height="18" rx="1" />
          <rect x="11" y="3" width="5" height="18" rx="1" />
          <path d="M18.5 5l2.4 16" />
        </svg>
      );
    case "star":
      return (
        <svg {...p}>
          <path d="M12 3l2.7 6 6.3.7-4.8 4.3 1.4 6.3L12 17.4 6.4 20.3l1.4-6.3L3 9.7l6.3-.7z" />
        </svg>
      );
    case "share":
      return (
        <svg {...p}>
          <circle cx="18" cy="5" r="2.6" />
          <circle cx="6" cy="12" r="2.6" />
          <circle cx="18" cy="19" r="2.6" />
          <path d="M8.3 10.8l7.4-4.3M8.3 13.2l7.4 4.3" />
        </svg>
      );
    case "filter":
      return (
        <svg {...p}>
          <path d="M3 5h18l-7 8v6l-4-2v-4z" />
        </svg>
      );
    case "grid":
      return (
        <svg {...p}>
          <rect x="3" y="3" width="7" height="7" rx="1.2" />
          <rect x="14" y="3" width="7" height="7" rx="1.2" />
          <rect x="3" y="14" width="7" height="7" rx="1.2" />
          <rect x="14" y="14" width="7" height="7" rx="1.2" />
        </svg>
      );
    case "rows":
      return (
        <svg {...p}>
          <path d="M3 6h18M3 12h18M3 18h18" />
        </svg>
      );
    case "tag":
      return (
        <svg {...p}>
          <path d="M3 11.5V4h7.5L21 14.5 14.5 21z" />
          <circle cx="7.5" cy="7.5" r="1.3" fill="currentColor" />
        </svg>
      );
    case "check":
      return (
        <svg {...p}>
          <path d="M4 12.5l5 5 11-11" />
        </svg>
      );
    case "mail":
      return (
        <svg {...p}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M3.5 6.5L12 13l8.5-6.5" />
        </svg>
      );
    case "message":
      return (
        <svg {...p}>
          <path d="M4 5h16v11H9l-5 4z" />
        </svg>
      );
    case "slack":
      return (
        <svg {...p}>
          <rect x="9.2" y="3" width="2.2" height="8" rx="1.1" />
          <rect x="13" y="9.2" width="8" height="2.2" rx="1.1" />
          <rect x="12.6" y="13" width="2.2" height="8" rx="1.1" />
          <rect x="3" y="12.6" width="8" height="2.2" rx="1.1" />
        </svg>
      );
    case "link":
      return (
        <svg {...p}>
          <path d="M9 13a4 4 0 005.7 0l3-3a4 4 0 10-5.7-5.7L10.5 6" />
          <path d="M15 11a4 4 0 00-5.7 0l-3 3a4 4 0 105.7 5.7L13.5 18" />
        </svg>
      );
    case "cmd":
      return (
        <svg {...p}>
          <path d="M9 6a3 3 0 10-3 3h12a3 3 0 10-3-3v12a3 3 0 103-3H6a3 3 0 10-3 3" />
        </svg>
      );
    case "arrow":
      return (
        <svg {...p}>
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      );
    case "plus":
      return (
        <svg {...p}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      );
    case "clock":
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7.5V12l3 2" />
        </svg>
      );
    case "chevron":
      return (
        <svg {...p}>
          <path d="M9 6l6 6-6 6" />
        </svg>
      );
    case "down":
      return (
        <svg {...p}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      );
    case "sun":
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="4.2" />
          <path d="M12 2.5v2.5M12 19v2.5M4.5 4.5l1.8 1.8M17.7 17.7l1.8 1.8M2.5 12H5M19 12h2.5M4.5 19.5l1.8-1.8M17.7 6.3l1.8-1.8" />
        </svg>
      );
    case "moon":
      return (
        <svg {...p}>
          <path d="M20 14.5A8 8 0 119.5 4a6.5 6.5 0 0010.5 10.5z" />
        </svg>
      );
    case "user":
      return (
        <svg {...p}>
          <circle cx="12" cy="8.5" r="3.6" />
          <path d="M5.5 20a6.5 6.5 0 0113 0" />
        </svg>
      );
    case "x":
      return (
        <svg {...p}>
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      );
    case "sort":
      return (
        <svg {...p}>
          <path d="M7 4v16M7 20l-3-3M7 4l3 3M17 20V4M17 4l3 3M17 20l-3-3" />
        </svg>
      );
    default:
      return null;
  }
}
