// Viewport hook — true below the mobile breakpoint (<760px).
//
// From the Claude Design responsive handoff (chat: "what can we do to make this
// mobile friendly and responsive?"): the prototype's fixed pixel widths overflowed
// on phones, so each view reflows below 760px. This hook is the single source of
// truth for that breakpoint; components take a `mob` boolean and adapt their layout.

import { useEffect, useState } from "react";

export const MOBILE_BREAKPOINT = 760;

// matchMedia is absent in jsdom/SSR; degrade to desktop (not-mobile) there.
const supported = (): boolean =>
  typeof window !== "undefined" && typeof window.matchMedia === "function";

export function useMobile(): boolean {
  const query = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;
  const [mob, setMob] = useState(() => (supported() ? window.matchMedia(query).matches : false));

  useEffect(() => {
    if (!supported()) return;
    const mq = window.matchMedia(query);
    const onChange = () => setMob(mq.matches);
    onChange(); // sync in case the viewport changed before this effect ran
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);

  return mob;
}
