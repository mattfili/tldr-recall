// Prev/next issue control, ported from tldr-web/prototype.jsx IssueNav.
// In #3 it actually pages through real issues within an edition — the caller
// supplies onClick + disabled based on the /issues list.

import { Ico } from "./atoms";

export function IssueNav({
  dir,
  disabled = false,
  onClick,
}: {
  dir: "prev" | "next";
  disabled?: boolean;
  onClick?: () => void;
}) {
  const prev = dir === "prev";
  const title = prev ? "Previous issue" : "Next issue";
  return (
    <button
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      style={{
        width: 32,
        height: 32,
        borderRadius: 8,
        border: "none",
        background: "transparent",
        cursor: disabled ? "default" : "pointer",
        color: disabled ? "var(--ink-4)" : "var(--ink-3)",
        opacity: disabled ? 0.4 : 1,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "background .12s, color .12s",
      }}
      onMouseEnter={(e) => {
        if (disabled) return;
        e.currentTarget.style.background = "var(--surface-2)";
        e.currentTarget.style.color = "var(--ink)";
      }}
      onMouseLeave={(e) => {
        if (disabled) return;
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = "var(--ink-3)";
      }}
    >
      <span style={{ display: "inline-flex", transform: prev ? "rotate(180deg)" : "none" }}>
        <Ico name="chevron" s={18} sw={1.9} />
      </span>
    </button>
  );
}
