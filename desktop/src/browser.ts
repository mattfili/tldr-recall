// In-app browser (#25, spec §10.3–10.4) — owned by the MAIN process.
//
// Clicking an article in the renderer calls platform.openExternal(url) →
// preload bridge → IPC here → a hardened WebContentsView is attached to the
// main window, sized below a slim chrome-bar strip that the Recall renderer
// keeps drawing in its top CHROME_BAR_HEIGHT pixels. "Back to Recall" simply
// detaches/destroys the view: the renderer never navigated, so the reader's
// scroll position survives by construction.
//
// SECURITY (spec §10.4, non-negotiable):
//   - The view's webPreferences: contextIsolation: true, nodeIntegration:
//     false, sandbox: true, and NO preload — external content gets zero bridge.
//   - Every navigation target is validated by validateExternalUrl (http/https
//     only; file://, javascript:, data:, ... rejected) — at open(), at
//     will-navigate, at window.open, and again before shell.openExternal.
//   - window.open / target=_blank from external pages is DENIED; valid targets
//     navigate the SAME hardened view. Never a new (Node-enabled) window.
//   - IPC handlers act only for the main window's own main frame (sender
//     validation), so a compromised subframe cannot drive the browser.

import {
  BrowserWindow,
  WebContentsView,
  ipcMain,
  shell,
  type IpcMainInvokeEvent,
} from "electron";
import { BROWSER_CHANNELS } from "./channels";
import { domainOf, validateExternalUrl } from "./validate-url";

// Height (px) of the chrome bar the renderer draws while the browser is open.
// MUST match CHROME_BAR_HEIGHT in frontend/src/components/BrowserChrome.tsx.
export const CHROME_BAR_HEIGHT = 44;

/** Mirrors BrowserState in frontend/src/platform/index.ts (canonical shape). */
interface BrowserState {
  open: boolean;
  url: string;
  domain: string;
  canGoBack: boolean;
  canGoForward: boolean;
}

const CLOSED_STATE: BrowserState = {
  open: false,
  url: "",
  domain: "",
  canGoBack: false,
  canGoForward: false,
};

/**
 * Wire the in-app browser onto the main window. Called once per window from
 * createWindow() in main.ts. Only one main window exists at a time; handlers
 * are re-registered (removeHandler first) if macOS "activate" re-creates it.
 */
export function attachBrowser(win: BrowserWindow): void {
  let view: WebContentsView | null = null;

  const currentState = (): BrowserState => {
    if (!view) return CLOSED_STATE;
    const wc = view.webContents;
    const url = wc.getURL();
    return {
      open: true,
      url,
      domain: domainOf(url),
      canGoBack: wc.canGoBack(),
      canGoForward: wc.canGoForward(),
    };
  };

  const pushState = (): void => {
    if (win.isDestroyed()) return;
    win.webContents.send(BROWSER_CHANNELS.state, currentState());
  };

  // The view fills the window below the renderer-drawn chrome bar.
  const layout = (): void => {
    if (!view) return;
    const [width, height] = win.getContentSize();
    view.setBounds({
      x: 0,
      y: CHROME_BAR_HEIGHT,
      width,
      height: Math.max(0, height - CHROME_BAR_HEIGHT),
    });
  };

  const relayoutEvents = [
    "resize",
    "maximize",
    "unmaximize",
    "enter-full-screen",
    "leave-full-screen",
  ] as const;
  for (const ev of relayoutEvents) {
    // eslint-friendly narrow cast: BrowserWindow's `on` overloads are unioned.
    (win.on as (event: string, listener: () => void) => BrowserWindow)(ev, layout);
  }

  const close = (): void => {
    if (!view) return;
    const closing = view;
    view = null;
    win.contentView.removeChildView(closing);
    // Destroy-on-close: guarantees no background audio/leaks from the page.
    closing.webContents.close();
    pushState();
  };

  const open = (rawUrl: unknown): void => {
    const url = validateExternalUrl(rawUrl);
    if (!url) return; // refused (file://, javascript:, garbage, ...)

    // Fresh view per open (destroy any previous one first).
    close();

    view = new WebContentsView({
      webPreferences: {
        // §10.4 hardening for EXTERNAL content. No preload: zero bridge.
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    const wc = view.webContents;

    // Popups / target=_blank: never a new window. Valid http(s) targets
    // navigate this same hardened view; everything else is dropped.
    wc.setWindowOpenHandler(({ url: target }) => {
      const ok = validateExternalUrl(target);
      if (ok && view) void view.webContents.loadURL(ok);
      return { action: "deny" };
    });

    // Block in-page redirects to non-http(s) schemes (file:, javascript:, ...).
    wc.on("will-navigate", (event, target) => {
      if (!validateExternalUrl(target)) event.preventDefault();
    });
    // Defense-in-depth: also refuse server-side 3xx redirects to non-http(s) schemes.
    wc.on("will-redirect", (event, target) => {
      if (!validateExternalUrl(target)) event.preventDefault();
    });
    // External pages get no device/notification/media permissions — deny all.
    wc.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));

    // Keep the renderer's chrome bar in sync.
    wc.on("did-navigate", pushState);
    wc.on("did-navigate-in-page", pushState);
    wc.on("did-finish-load", pushState);

    win.contentView.addChildView(view);
    layout();
    void wc.loadURL(url);
    pushState();
  };

  // ── IPC (validated senders) ────────────────────────────────────────────
  // Only the main window's own MAIN frame may drive the browser; external
  // content lives in a separate WebContentsView and never reaches these.
  const trusted = (event: IpcMainInvokeEvent): boolean =>
    !win.isDestroyed() &&
    event.sender === win.webContents &&
    event.senderFrame === win.webContents.mainFrame;

  const handle = (channel: string, fn: (event: IpcMainInvokeEvent, payload: unknown) => void): void => {
    ipcMain.removeHandler(channel); // re-attach safe if the window is re-created
    ipcMain.handle(channel, (event, payload: unknown) => {
      if (!trusted(event)) return;
      fn(event, payload);
    });
  };

  handle(BROWSER_CHANNELS.open, (_e, url) => open(url));
  handle(BROWSER_CHANNELS.close, () => close());
  handle(BROWSER_CHANNELS.reload, () => view?.webContents.reload());
  handle(BROWSER_CHANNELS.goBack, () => {
    if (view?.webContents.canGoBack()) view.webContents.goBack();
  });
  handle(BROWSER_CHANNELS.goForward, () => {
    if (view?.webContents.canGoForward()) view.webContents.goForward();
  });
  handle(BROWSER_CHANNELS.openInSystem, () => {
    if (!view) return;
    // Re-validate: only ever hand http(s) to the OS.
    const url = validateExternalUrl(view.webContents.getURL());
    if (url) void shell.openExternal(url);
  });

  win.once("closed", () => {
    view = null;
  });
}
