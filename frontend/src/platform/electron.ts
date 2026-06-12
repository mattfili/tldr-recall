// Electron platform impl (spec §10.3): article links open in the in-app
// browser (#25) via the preload-bridged IPC surface. Selected by index.ts
// only when window.recall.browser exists.
//
// openMailto (#39) is exposed ONLY when the shell's preload offers the system
// surface — a stale shell yields `undefined`, telling callers (SharePop) to
// use the copy fallback instead.

import type { Platform, RecallBrowserBridge, RecallSystemBridge } from "./index";

export function makeElectronPlatform(
  browser: RecallBrowserBridge,
  system?: RecallSystemBridge,
): Platform {
  const platform: Platform = {
    openExternal(url: string): void {
      void browser.open(url);
    },
    isDesktop: true,
  };
  if (system) {
    platform.openMailto = (url: string): void => {
      void system.openMailto(url);
    };
  }
  return platform;
}
