// The ONLY file in the codebase that touches posthog-js (spec §12.4 seam — same vendor
// isolation as the backend rerank). Loaded via dynamic import() so Vite code-splits the
// SDK into its own chunk: the no-op path (no key / declined / DNT) never downloads or
// executes a single byte of it.
//
// Privacy: anonymous device id only (posthog's default anonymous mode) — identify() is
// NEVER called. Autocapture, pageviews, and session recording are all off; the only
// traffic is the five explicit events in events.ts.

import type { AnalyticsSink } from "./events";

export async function loadPosthog(key: string, host: string): Promise<AnalyticsSink> {
  const { default: posthog } = await import("posthog-js");
  posthog.init(key, {
    api_host: host,
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    disable_session_recording: true,
    persistence: "localStorage",
  });
  return {
    capture(event, props) {
      posthog.capture(event, props);
    },
  };
}
