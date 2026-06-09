// Persisted UI preferences (dark mode + last edition), stored in localStorage
// under 'recall-prefs'. Defaults: light mode, the TLDR edition (matches shot.png).

import { useCallback, useEffect, useState } from "react";

const LS_KEY = "recall-prefs";
const DEFAULT_EDITION = "tldr";
const DEFAULT_DENSITY: Density = "compact";

/** Library row density. Presentation only (like dark mode) — NEVER a query param. */
export type Density = "compact" | "expanded";

export interface Prefs {
  dark: boolean;
  edition: string;
  density: Density;
}

function load(): Prefs {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { dark: false, edition: DEFAULT_EDITION, density: DEFAULT_DENSITY };
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return {
      dark: parsed.dark ?? false,
      edition: parsed.edition ?? DEFAULT_EDITION,
      density: parsed.density ?? DEFAULT_DENSITY,
    };
  } catch {
    return { dark: false, edition: DEFAULT_EDITION, density: DEFAULT_DENSITY };
  }
}

export function usePrefs() {
  const [prefs, setPrefs] = useState<Prefs>(load);

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(prefs));
    } catch {
      // ignore write failures (private mode, etc.)
    }
  }, [prefs]);

  // Keep the document body background in sync with the theme so there is no
  // flash of the wrong canvas color outside the .rc root (matches prototype).
  useEffect(() => {
    document.body.style.background = prefs.dark ? "#191512" : "#f7f6f2";
  }, [prefs.dark]);

  const toggleDark = useCallback(() => setPrefs((p) => ({ ...p, dark: !p.dark })), []);
  const setEdition = useCallback(
    (edition: string) => setPrefs((p) => ({ ...p, edition })),
    [],
  );
  const setDensity = useCallback(
    (density: Density) => setPrefs((p) => ({ ...p, density })),
    [],
  );

  return { prefs, toggleDark, setEdition, setDensity };
}
