// Chrome bar for the desktop in-app browser (#25, spec §10.4) — rendered by
// the RECALL renderer, not by external content. While the main process has a
// WebContentsView open, that view covers the window BELOW y = CHROME_BAR_HEIGHT;
// this bar owns the renderer's top strip. "Back to Recall" closes the view —
// the renderer never navigated, so the reader resumes at its prior scroll.
//
// Mounted unconditionally in App.tsx: renders null on web (no bridge) and
// whenever the browser is closed, so it costs nothing outside desktop.
//
// Styling: inline + design-system variables only — recall.css is never edited.

import { useEffect, useState } from "react";
import type { BrowserState } from "../platform";

// MUST match CHROME_BAR_HEIGHT in desktop/src/browser.ts (the main process
// positions the WebContentsView immediately below this strip).
export const CHROME_BAR_HEIGHT = 44;

const CLOSED: BrowserState = {
  open: false,
  url: "",
  domain: "",
  canGoBack: false,
  canGoForward: false,
};

function ChromeBtn({
  label,
  title,
  onClick,
  disabled = false,
  emphasis = false,
}: {
  label: string;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  emphasis?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      style={{
        height: 28,
        padding: emphasis ? "0 12px" : "0 9px",
        borderRadius: 8,
        border: "1px solid " + (emphasis ? "var(--line)" : "transparent"),
        background: emphasis ? "var(--surface)" : "transparent",
        color: disabled ? "var(--ink-4)" : "var(--ink-2)",
        font: "inherit",
        fontSize: 12.5,
        fontWeight: 600,
        letterSpacing: "-0.01em",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.45 : 1,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        whiteSpace: "nowrap",
        transition: "background .12s, color .12s",
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.background = "var(--surface-2)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = emphasis ? "var(--surface)" : "transparent";
      }}
    >
      {label}
    </button>
  );
}

export function BrowserChrome() {
  const [state, setState] = useState<BrowserState>(CLOSED);
  const bridge = typeof window !== "undefined" ? window.recall?.browser : undefined;

  useEffect(() => {
    if (!bridge) return;
    return bridge.onState(setState); // onState returns the unsubscribe fn
  }, [bridge]);

  if (!bridge || !state.open) return null;

  return (
    <div
      role="toolbar"
      aria-label="In-app browser controls"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: CHROME_BAR_HEIGHT,
        zIndex: 40, // above TopBar (20) and its panels (30)
        boxSizing: "border-box",
        background: "var(--paper)",
        borderBottom: "1px solid var(--line-2)",
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "0 14px",
      }}
    >
      <ChromeBtn
        label="← Recall"
        title="Back to Recall"
        emphasis
        onClick={() => void bridge.close()}
      />
      <span aria-hidden style={{ width: 1, height: 20, background: "var(--line)", margin: "0 4px" }} />
      <ChromeBtn
        label="‹"
        title="Site back"
        disabled={!state.canGoBack}
        onClick={() => void bridge.goBack()}
      />
      <ChromeBtn
        label="›"
        title="Site forward"
        disabled={!state.canGoForward}
        onClick={() => void bridge.goForward()}
      />
      <ChromeBtn label="⟳" title="Reload page" onClick={() => void bridge.reload()} />
      <span
        className="mono"
        title={state.url}
        style={{
          flex: 1,
          minWidth: 0,
          textAlign: "center",
          fontFamily: "var(--mono)",
          fontSize: 12,
          color: "var(--ink-3)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          padding: "0 10px",
        }}
      >
        {state.domain}
      </span>
      <ChromeBtn
        label="Open in browser ↗"
        title="Open in system browser"
        onClick={() => void bridge.openInSystem()}
      />
    </div>
  );
}
