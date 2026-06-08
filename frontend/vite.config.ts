import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Recall frontend (web + Electron renderer share this build).
// Dev server runs on :5173; backend on :8000 (see SHARED CONTRACT).
// `base: "./"` keeps asset paths relative so the same build loads from
// Electron's file:// origin as well as the web host.
export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    port: 5173,
  },
  test: {
    globals: true,
    environment: "node",
  },
});
