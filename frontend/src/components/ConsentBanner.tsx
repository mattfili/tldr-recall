// Analytics consent banner (issue #24, spec §12.4) — DEFAULT-DECLINE.
//
// Renders ONLY when a PostHog key is configured AND no consent choice is stored AND
// Do-Not-Track is off (with DNT on capture can never enable, so asking is pointless).
// With no key configured the banner never exists — the app is byte-for-byte unchanged.
//
// Decline is the default: it is the primary-styled (`rc-btn primary`), first-listed,
// autofocused action, and a null/declined choice keeps the no-op either way. Accept
// persists "accepted" and enables capture from then on (enableAnalytics re-runs the
// factory). Styling is the codebase idiom: existing recall.css classes + inline styles
// only — recall.css stays byte-identical.

import { useState } from "react";
import { enableAnalytics, hasAnalyticsKey } from "../analytics";
import { getStoredConsent, isDntEnabled, storeConsent, type ConsentChoice } from "../analytics/consent";

export function ConsentBanner() {
  const [choice, setChoice] = useState<ConsentChoice | null>(getStoredConsent);

  if (!hasAnalyticsKey() || isDntEnabled() || choice !== null) return null;

  const decline = () => {
    storeConsent("declined");
    setChoice("declined");
  };
  const accept = () => {
    enableAnalytics(); // persists "accepted" + switches capture on
    setChoice("accepted");
  };

  return (
    <div
      role="dialog"
      aria-label="Analytics consent"
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 60,
        background: "var(--surface)",
        borderTop: "1px solid var(--line)",
        boxShadow: "var(--shadow-md)",
        padding: "14px 20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        flexWrap: "wrap",
      }}
    >
      <span
        className="mono"
        style={{ fontSize: 12, color: "var(--ink-3)", letterSpacing: ".02em", maxWidth: 560 }}
      >
        Allow anonymous usage analytics? No personal data is collected — just which
        stories and searches get used. Off unless you opt in.
      </span>
      <span style={{ display: "flex", alignItems: "center", gap: 8, flex: "none" }}>
        {/* Decline is the DEFAULT action: primary-styled, listed first, autofocused. */}
        <button className="rc-btn primary" autoFocus onClick={decline}>
          Decline
        </button>
        <button className="rc-btn" onClick={accept}>
          Allow analytics
        </button>
      </span>
    </div>
  );
}
