import { contextBridge, ipcRenderer } from "electron";

// Preload runs in an isolated context bridging the (sandboxed) renderer and
// the main process. The exposed surface is MINIMAL by design (spec §10.4):
// a desktop flag plus the in-app browser controls — nothing else. No raw
// ipcRenderer, no Node globals, no event objects ever cross the bridge.
//
// NOTE: this preload runs sandboxed (main window has sandbox: true), so it
// cannot `require` local modules — the channel names below are inlined string
// literals that MUST stay in sync with desktop/src/channels.ts.
//
// The canonical TypeScript shape of this bridge lives in
// frontend/src/platform/index.ts (RecallBridge / RecallBrowserBridge /
// BrowserState). Keep both in sync when changing the surface.

interface BrowserState {
  open: boolean;
  url: string;
  domain: string;
  canGoBack: boolean;
  canGoForward: boolean;
}

const STATE_CHANNEL = "recall:browser:state";

contextBridge.exposeInMainWorld("recall", {
  isDesktop: true,
  browser: {
    open: (url: string): Promise<void> => ipcRenderer.invoke("recall:browser:open", url),
    close: (): Promise<void> => ipcRenderer.invoke("recall:browser:close"),
    reload: (): Promise<void> => ipcRenderer.invoke("recall:browser:reload"),
    goBack: (): Promise<void> => ipcRenderer.invoke("recall:browser:goBack"),
    goForward: (): Promise<void> => ipcRenderer.invoke("recall:browser:goForward"),
    openInSystem: (): Promise<void> => ipcRenderer.invoke("recall:browser:openInSystem"),
    /** Subscribe to browser state pushes; returns an unsubscribe function. */
    onState: (cb: (state: BrowserState) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, state: BrowserState): void => {
        cb(state); // sanitized state only — never the IPC event
      };
      ipcRenderer.on(STATE_CHANNEL, listener);
      return () => {
        ipcRenderer.removeListener(STATE_CHANNEL, listener);
      };
    },
  },
  system: {
    // #39 share-by-email: a mailto: draft opened via the OS default mail client
    // (main process validates mailto:-only, then shell.openExternal — never the
    // in-app view). Channel literal inlined (sandboxed preload) — keep in sync
    // with desktop/src/channels.ts BROWSER_CHANNELS.openMailto.
    openMailto: (url: string): Promise<void> =>
      ipcRenderer.invoke("recall:system:openMailto", url),
  },
});
