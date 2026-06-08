// Share popover, ported from tldr-web/prototype.jsx SharePop.
// Outside-click closes it; "Copy link" shows a transient "Copied!" state.

import { useEffect, useState } from "react";
import { Ico } from "./atoms";
import type { IcoName } from "./atoms";

const TARGETS: [IcoName, string][] = [
  ["message", "iMessage"],
  ["mail", "Email"],
  ["slack", "Slack"],
  ["link", "Copy link"],
];

export function SharePop({ onClose }: { onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const off = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target?.closest("[data-share]")) onClose();
    };
    document.addEventListener("pointerdown", off, true);
    return () => document.removeEventListener("pointerdown", off, true);
  }, [onClose]);

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
      {TARGETS.map(([ic, label]) => (
        <button
          key={ic}
          onClick={() => {
            if (ic === "link") {
              setCopied(true);
              setTimeout(onClose, 650);
            } else onClose();
          }}
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
            <Ico name={copied && ic === "link" ? "check" : ic} s={17} />
          </span>
          {copied && ic === "link" ? "Copied!" : label}
        </button>
      ))}
    </div>
  );
}
