// IPC channel names for the in-app browser (#25).
//
// Imported by browser.ts (main process). preload.ts CANNOT import this file:
// the renderer runs with sandbox: true, and sandboxed preload scripts only get
// a polyfilled `require` for built-ins ("electron", "events", ...), not local
// modules — so preload.ts inlines the same string literals. If you change a
// channel name here, change it in preload.ts too.
export const BROWSER_CHANNELS = {
  open: "recall:browser:open",
  close: "recall:browser:close",
  reload: "recall:browser:reload",
  goBack: "recall:browser:goBack",
  goForward: "recall:browser:goForward",
  openInSystem: "recall:browser:openInSystem",
  /** main -> renderer state push (BrowserState payload). */
  state: "recall:browser:state",
} as const;
