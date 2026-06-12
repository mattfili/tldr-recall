// Runs BEFORE any frontend module evaluates (first import in the DOM component).
// frontend/src/platform/index.ts detects this marker at module-import time and
// selects the mobile platform (native in-app browser via the lazily-assigned
// window.__RECALL_OPEN_EXTERNAL__ — see RecallApp.tsx).

if (typeof window !== "undefined") {
  window.__RECALL_MOBILE__ = true;
}

export {};
