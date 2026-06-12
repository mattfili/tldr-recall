// Platform shim (spec §10.3). The single place that branches behavior
// between the web build and the Electron renderer.
//
// `index.ts` detects the Electron preload bridge (window.recall, exposed via
// contextBridge in desktop/src/preload.ts) and selects the impl. This file is
// also the CANONICAL home of the bridge's TypeScript shape — the desktop
// preload mirrors it (it cannot import across packages).

import { makeElectronPlatform } from "./electron";
import { webPlatform } from "./web";

export interface Platform {
  /** Open an external article URL (new tab on web, in-app browser on desktop). */
  openExternal(url: string): void;
  /**
   * Open a mailto: draft via the system mail client (#39 share-by-email).
   * Always present on web; on desktop only when the shell exposes the system
   * bridge surface. `undefined` ⇒ the caller MUST use the copy fallback.
   */
  openMailto?: (url: string) => void;
  /** True inside the Electron renderer. */
  isDesktop: boolean;
}

/** State pushed by the main process while the in-app browser is open (#25). */
export interface BrowserState {
  open: boolean;
  url: string;
  domain: string;
  canGoBack: boolean;
  canGoForward: boolean;
}

/** In-app browser controls exposed by the preload bridge (#25, spec §10.4). */
export interface RecallBrowserBridge {
  open(url: string): void | Promise<void>;
  close(): void | Promise<void>;
  reload(): void | Promise<void>;
  goBack(): void | Promise<void>;
  goForward(): void | Promise<void>;
  openInSystem(): void | Promise<void>;
  /** Subscribe to browser state pushes; returns an unsubscribe function. */
  onState(cb: (state: BrowserState) => void): () => void;
}

/** System-open surface (#39): mailto: drafts via shell.openExternal — never the in-app view. */
export interface RecallSystemBridge {
  openMailto(url: string): void | Promise<void>;
}

/** Shape of the preload bridge Electron exposes on window (desktop/src/preload.ts). */
export interface RecallBridge {
  isDesktop: boolean;
  /** Absent in stale M0 shells — detection falls back to web behavior then. */
  browser?: RecallBrowserBridge;
  /** Absent in shells predating #39 — platform.openMailto stays undefined then. */
  system?: RecallSystemBridge;
}

declare global {
  interface Window {
    recall?: RecallBridge;
  }
}

function detectPlatform(): Platform {
  const bridge = typeof window !== "undefined" ? window.recall : undefined;
  // Require the browser surface, not just the flag: an old shell without the
  // in-app browser must keep getting working links via window.open.
  return bridge?.browser ? makeElectronPlatform(bridge.browser, bridge.system) : webPlatform;
}

export const platform: Platform = detectPlatform();
