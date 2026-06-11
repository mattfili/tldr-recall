// Client-side consent storage + Do-Not-Track detection (spec §12.4 privacy).
// Mirrors the usePrefs localStorage idiom: try/catch around every access so private
// mode / disabled storage degrades to the safe default — which is DECLINED (null
// consent never enables capture; see analytics/index.ts).

const LS_KEY = "recall-analytics-consent";

export type ConsentChoice = "accepted" | "declined";

/** The stored consent choice, or null when the user has never chosen (banner shows). */
export function getStoredConsent(): ConsentChoice | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw === "accepted" || raw === "declined" ? raw : null;
  } catch {
    return null;
  }
}

/** Persist the user's choice. Write failures are ignored (private mode, etc.). */
export function storeConsent(choice: ConsentChoice): void {
  try {
    localStorage.setItem(LS_KEY, choice);
  } catch {
    // ignore — with nothing stored, consent stays null and capture stays off.
  }
}

/**
 * Honor Do-Not-Track (spec §12.4, required). Checks the standard `navigator.doNotTrack`
 * plus the legacy `window.doNotTrack` / `navigator.msDoNotTrack` spellings.
 */
export function isDntEnabled(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & { doNotTrack?: string; msDoNotTrack?: string };
  const win =
    typeof window !== "undefined" ? (window as Window & { doNotTrack?: string }) : undefined;
  const dnt = nav.doNotTrack ?? win?.doNotTrack ?? nav.msDoNotTrack;
  return dnt === "1" || dnt === "yes";
}
