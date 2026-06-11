import { app, BrowserWindow } from "electron";
import * as path from "node:path";
import { attachBrowser } from "./browser";

// Recall Electron shell. Window creation + standard app lifecycle; the
// in-app article browser (hardened WebContentsView + IPC, #25) lives in
// browser.ts and is wired onto the window via attachBrowser().

// In dev, the frontend Vite dev server URL is passed via ELECTRON_START_URL
// (e.g. http://localhost:5173). In a packaged build (electron-builder) the
// built frontend is staged as an extraResource at
// <resources>/frontend/dist/index.html. When running from an unpackaged repo
// checkout, we fall back to the sibling build at ../frontend/dist/index.html.
const START_URL = process.env.ELECTRON_START_URL;

function resolveIndexHtml(): string {
  if (app.isPackaged) {
    // electron-builder extraResources: frontend/dist lands next to app.asar
    // in Contents/Resources (mac) / resources (win).
    return path.join(process.resourcesPath, "frontend", "dist", "index.html");
  }
  // Repo checkout: dist/main.js -> ../../frontend/dist/index.html
  return path.join(__dirname, "..", "..", "frontend", "dist", "index.html");
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1280,
    height: 832,
    minWidth: 880,
    minHeight: 600,
    title: "Recall",
    backgroundColor: "#ffffff",
    webPreferences: {
      // Security posture: the renderer is untrusted UI code.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  attachBrowser(window);

  if (START_URL) {
    void window.loadURL(START_URL);
  } else {
    void window.loadFile(resolveIndexHtml());
  }
}

app.whenReady().then(() => {
  createWindow();

  // macOS: re-create a window when the dock icon is clicked and none are open.
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS where apps typically stay
// active until the user quits explicitly with Cmd+Q.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
