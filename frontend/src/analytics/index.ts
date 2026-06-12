// Analytics seam (issue #24, spec §12.4) — factory + config, same pattern as the backend
// rerank: a typed `analytics` facade every call site imports, with the implementation
// selected at startup and a NO-OP DEFAULT.
//
// Capture is enabled ONLY when ALL hold:
//   1. VITE_POSTHOG_KEY is set (no key ⇒ the app behaves byte-for-byte as today),
//   2. the stored consent choice is "accepted" (null/declined ⇒ no-op — decline by default),
//   3. Do-Not-Track is off.
// Otherwise the sink is a no-op: zero capture paths fire, zero network, and posthog-js is
// never even loaded (it lives behind a dynamic import in posthog.ts).

import { env } from "../env";
import { getStoredConsent, isDntEnabled, storeConsent, type ConsentChoice } from "./consent";
import type { Analytics, AnalyticsEventName, AnalyticsSink } from "./events";
import { loadPosthog } from "./posthog";

export type { Analytics, AnalyticsEvents, AnalyticsEventName, SourceView } from "./events";

const DEFAULT_HOST = "https://us.i.posthog.com";

const noopSink: AnalyticsSink = {
  capture() {
    // analytics disabled — deliberately nothing.
  },
};

// The active implementation. Call sites bind to `analytics` once; the sink swaps under it.
let sink: AnalyticsSink = noopSink;

/** The typed facade every view/hook imports. NEVER import posthog-js outside this module. */
export const analytics: Analytics = {
  capture(event, props) {
    sink.capture(event, props);
  },
};

/** Everything the factory needs, injectable for tests (pure — reads no globals). */
export interface AnalyticsConfig {
  key: string | undefined;
  host: string | undefined;
  consent: ConsentChoice | null;
  dnt: boolean;
  /** SDK loader, defaults to the real dynamic-import posthog loader. */
  load?: (key: string, host: string) => Promise<AnalyticsSink>;
}

/**
 * Pure factory: decide no-op vs posthog from config. When enabled it returns a small
 * synchronous buffering sink immediately, kicks off the (dynamic-import) SDK load, then
 * swaps in the real sink and flushes the buffer. If the SDK fails to load, the buffer is
 * dropped and the sink silently stays inert — never throws into the UI.
 */
export function createAnalytics(config: AnalyticsConfig): AnalyticsSink {
  if (!config.key || config.dnt || config.consent !== "accepted") return noopSink;

  const load = config.load ?? loadPosthog;
  let real: AnalyticsSink | null = null;
  let buffer: Array<[AnalyticsEventName, Record<string, unknown>]> | null = [];

  void load(config.key, config.host || DEFAULT_HOST)
    .then((loaded) => {
      real = loaded;
      for (const [event, props] of buffer ?? []) loaded.capture(event, props);
      buffer = null;
    })
    .catch(() => {
      buffer = null; // SDK load failed — drop buffered events, stay no-op.
    });

  return {
    capture(event, props) {
      if (real) real.capture(event, props);
      else buffer?.push([event, props]);
    },
  };
}

function envKey(): string | undefined {
  const key = env.posthogKey;
  return key && key.trim().length > 0 ? key : undefined;
}

/** True when a PostHog key is configured — gates the consent banner's existence. */
export function hasAnalyticsKey(): boolean {
  return envKey() !== undefined;
}

/** Select the implementation once at startup (called from main.tsx before render). */
export function initAnalytics(): void {
  sink = createAnalytics({
    key: envKey(),
    host: env.posthogHost,
    consent: getStoredConsent(),
    dnt: isDntEnabled(),
  });
}

/**
 * The consent banner's Accept action: persist the choice and enable capture from now on
 * (re-runs the factory, which now sees consent === "accepted").
 */
export function enableAnalytics(): void {
  storeConsent("accepted");
  initAnalytics();
}
