import { contextBridge } from "electron";

// Preload runs in an isolated context bridging the (sandboxed) renderer and
// the main process. For Issue #1 (M0) the only thing the frontend needs is a
// way to detect that it is running inside the Electron shell, so the
// platform/ shim can branch web vs electron behavior (see frontend §10.3).
//
// The richer IPC surface for the in-app browser (open/navigate a
// WebContentsView, back/forward, etc.) arrives in Issue #5 and will be added
// to this exposed `recall` object then.
contextBridge.exposeInMainWorld("recall", {
  isDesktop: true,
});
