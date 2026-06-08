import { app, BrowserWindow } from "electron";
import * as path from "node:path";

// Recall Electron shell (Issue #1, M0).
//
// This is a MINIMAL shell whose only job is to host the platform-agnostic
// frontend build. There is intentionally NO in-app browser here: the
// WebContentsView-based in-app browser (browser.ts) and its IPC wiring land
// in Issue #5. Keep this file to window creation + standard app lifecycle.

// In dev, the frontend Vite dev server URL is passed via ELECTRON_START_URL
// (e.g. http://localhost:5173). In production we load the built frontend that
// lives alongside the desktop package at ../frontend/dist/index.html.
const START_URL = process.env.ELECTRON_START_URL;

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

  if (START_URL) {
    void window.loadURL(START_URL);
  } else {
    // dist/main.js -> ../../frontend/dist/index.html
    const indexHtml = path.join(__dirname, "..", "..", "frontend", "dist", "index.html");
    void window.loadFile(indexHtml);
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
