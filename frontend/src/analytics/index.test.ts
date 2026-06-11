// createAnalytics factory tests (#24, spec §12.4): the no-op default is selected unless
// key + accepted consent + no-DNT ALL hold, and — critically — the SDK loader is NEVER
// invoked on any no-op path (the dynamic import of posthog-js never happens). The enabled
// path buffers events captured during the async SDK load and flushes them in order; a
// failed load silently degrades back to a no-op. No network anywhere — the loader is a spy.

import { describe, expect, it, vi } from "vitest";
import type { AnalyticsSink } from "./events";
import { createAnalytics, type AnalyticsConfig } from "./index";

function makeLoad(sink: AnalyticsSink) {
  // Arg-less signature (args are still recorded by the spy) to keep lint clean.
  return vi.fn((): Promise<AnalyticsSink> => Promise.resolve(sink));
}

function config(overrides: Partial<AnalyticsConfig>): AnalyticsConfig {
  return {
    key: "phc_test",
    host: undefined,
    consent: "accepted",
    dnt: false,
    ...overrides,
  };
}

const EVENT = {
  content_id: "c1",
  content_type: "article",
  state: "on",
} as const;

describe("createAnalytics (factory)", () => {
  it("no key → no-op: capture does nothing and the SDK loader is NEVER invoked", () => {
    const capture = vi.fn();
    const load = makeLoad({ capture });
    const sink = createAnalytics(config({ key: undefined, load }));

    sink.capture("save_toggled", EVENT);
    expect(load).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
  });

  it("key but consent null (no choice yet) → no-op, loader never invoked", () => {
    const load = makeLoad({ capture: vi.fn() });
    const sink = createAnalytics(config({ consent: null, load }));

    sink.capture("save_toggled", EVENT);
    expect(load).not.toHaveBeenCalled();
  });

  it("key but consent declined → no-op, loader never invoked", () => {
    const load = makeLoad({ capture: vi.fn() });
    const sink = createAnalytics(config({ consent: "declined", load }));

    sink.capture("save_toggled", EVENT);
    expect(load).not.toHaveBeenCalled();
  });

  it("key + accepted but Do-Not-Track on → no-op, loader never invoked", () => {
    const load = makeLoad({ capture: vi.fn() });
    const sink = createAnalytics(config({ dnt: true, load }));

    sink.capture("save_toggled", EVENT);
    expect(load).not.toHaveBeenCalled();
  });

  it("key + accepted + no DNT → loads the SDK with key/host and forwards captures", async () => {
    const capture = vi.fn();
    const load = makeLoad({ capture });
    const sink = createAnalytics(config({ host: "https://eu.i.posthog.com", load }));

    expect(load).toHaveBeenCalledWith("phc_test", "https://eu.i.posthog.com");
    await new Promise((r) => setTimeout(r, 0)); // let the (already-resolved) load settle
    sink.capture("save_toggled", EVENT);
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith("save_toggled", EVENT);
  });

  it("defaults the host to the US PostHog cloud when unset", () => {
    const load = makeLoad({ capture: vi.fn() });
    createAnalytics(config({ host: undefined, load }));
    expect(load).toHaveBeenCalledWith("phc_test", "https://us.i.posthog.com");
  });

  it("buffers events captured DURING the SDK load and flushes them in order on resolve", async () => {
    const capture = vi.fn();
    let resolve!: (sink: AnalyticsSink) => void;
    const load = vi.fn(() => new Promise<AnalyticsSink>((r) => (resolve = r)));
    const sink = createAnalytics(config({ load }));

    sink.capture("save_toggled", EVENT);
    sink.capture("result_open", { content_id: "c2", rank: 0, query: "agents" });
    expect(capture).not.toHaveBeenCalled(); // still loading

    resolve({ capture });
    await new Promise((r) => setTimeout(r, 0));
    expect(capture).toHaveBeenCalledTimes(2);
    expect(capture).toHaveBeenNthCalledWith(1, "save_toggled", EVENT);
    expect(capture).toHaveBeenNthCalledWith(2, "result_open", {
      content_id: "c2",
      rank: 0,
      query: "agents",
    });
  });

  it("a failed SDK load silently degrades to a no-op (drops buffered events, never throws)", async () => {
    const load = vi.fn(() => Promise.reject(new Error("offline")));
    const sink = createAnalytics(config({ load }));

    sink.capture("save_toggled", EVENT);
    expect(load).toHaveBeenCalledTimes(1);
    await new Promise((r) => setTimeout(r, 0));
    // After the rejection settles, capturing again must not throw and goes nowhere.
    sink.capture("save_toggled", EVENT);
  });
});
