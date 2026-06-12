// Search-box leading icon micro-animation (#44).
//
// A four-state glyph machine driven ENTIRELY by props (SearchView derives the state from its
// existing draft/submitted/query state — no new state sources):
//   idle      → flat spark at rest
//   typing    → star, with a ONE-SHOT 1.0→1.15→1.0 pulse fired per idle→typing transition
//   searching → star, continuous rotation while the query is in flight
//   results   → down arrow (pointing at the results below)
//
// Rendering: three glyph layers absolutely stacked inside a FIXED s×s box (no layout shift);
// transitions are crossfade + scale morphs via inline styles only. The pulse and rotation use
// the Web Animations API. recall.css is untouched (byte-identical).
//
// prefers-reduced-motion: transitions become instant swaps and both WAAPI animations are
// skipped. jsdom guards: window.matchMedia and Element.animate may not exist under tests.

import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import { Ico } from "./atoms";

export type SearchIconState = "idle" | "typing" | "searching" | "results";

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function SearchSparkIcon({ state, s = 21 }: { state: SearchIconState; s?: number }) {
  const starRef = useRef<HTMLSpanElement>(null);
  const prev = useRef<SearchIconState>(state);

  // One-shot pulse, fired only on the idle→typing TRANSITION (the prev-state ref means
  // per-keystroke re-renders and strict-mode double effects never re-fire it).
  useEffect(() => {
    const was = prev.current;
    prev.current = state;
    if (was !== "idle" || state !== "typing" || prefersReducedMotion()) return;
    const el = starRef.current;
    if (!el || typeof el.animate !== "function") return; // jsdom lacks WAAPI
    el.animate(
      [{ transform: "scale(1)" }, { transform: "scale(1.15)" }, { transform: "scale(1)" }],
      { duration: 250, easing: "ease-out" },
    );
  }, [state]);

  // Continuous rotation strictly while in flight; cancelled on settle/unmount.
  useEffect(() => {
    if (state !== "searching" || prefersReducedMotion()) return;
    const el = starRef.current;
    if (!el || typeof el.animate !== "function") return; // jsdom lacks WAAPI
    const spin = el.animate([{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }], {
      duration: 900,
      iterations: Infinity,
      easing: "linear",
    });
    return () => spin.cancel();
  }, [state]);

  const reduce = prefersReducedMotion();
  const layer = (active: boolean): CSSProperties => ({
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    opacity: active ? 1 : 0,
    transform: active ? "scale(1)" : "scale(0.8)",
    transition: reduce ? "none" : "opacity 200ms ease, transform 200ms ease",
  });

  return (
    <span
      data-testid="search-icon"
      data-state={state}
      aria-hidden
      style={{ position: "relative", width: s, height: s, display: "inline-flex", flex: "none" }}
    >
      <span style={layer(state === "idle")}>
        <Ico name="spark" s={s} />
      </span>
      <span ref={starRef} style={layer(state === "typing" || state === "searching")}>
        <Ico name="star" s={s} />
      </span>
      <span style={layer(state === "results")}>
        <Ico name="down" s={s} />
      </span>
    </span>
  );
}
