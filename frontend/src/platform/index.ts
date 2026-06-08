// Platform shim (spec §10.3). The single place that branches behavior
// between the web build and the Electron renderer.
//
// In M0 we only need the seam itself; the real in-app browser lands with
// the Electron work (#5). `index.ts` detects the Electron preload bridge
// (window.recall, exposed via contextBridge) and selects the impl.

import { webPlatform } from "./web";

export interface Platform {
  /** Open an external article URL (new tab on web, in-app browser on desktop). */
  openExternal(url: string): void;
  /** True inside the Electron renderer. */
  isDesktop: boolean;
}

/** Shape of the preload bridge Electron exposes on window (see desktop/#5). */
interface RecallBridge {
  openExternal(url: string): void;
}

declare global {
  interface Window {
    recall?: RecallBridge;
  }
}

/**
 * Thin Electron impl. In M0 the preload bridge does not exist yet, so this
 * is only selected once #5 ships `window.recall`. It forwards to the bridge.
 */
function makeElectronPlatform(bridge: RecallBridge): Platform {
  return {
    openExternal: (url: string) => bridge.openExternal(url),
    isDesktop: true,
  };
}

function detectPlatform(): Platform {
  const bridge =
    typeof window !== "undefined" ? window.recall : undefined;
  return bridge ? makeElectronPlatform(bridge) : webPlatform;
}

export const platform: Platform = detectPlatform();
