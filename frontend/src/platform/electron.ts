// Electron platform impl (spec §10.3): article links open in the in-app
// browser (#25) via the preload-bridged IPC surface. Selected by index.ts
// only when window.recall.browser exists.

import type { Platform, RecallBrowserBridge } from "./index";

export function makeElectronPlatform(browser: RecallBrowserBridge): Platform {
  return {
    openExternal(url: string): void {
      void browser.open(url);
    },
    isDesktop: true,
  };
}
