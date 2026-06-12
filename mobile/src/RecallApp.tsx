"use dom";

// The Recall mobile shell (issue #53): the ENTIRE existing responsive web app as
// one DOM component — recall.css rides along verbatim, data comes from the hosted
// API (src/env.mobile.ts via the metro alias). This is the deliberate v1
// architecture; screens can migrate to native incrementally later.
//
// Import order is load-bearing: bootstrap sets window.__RECALL_MOBILE__ before
// any frontend module evaluates, so the platform shim picks the mobile branch.

import "./bootstrap";
import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { initAnalytics } from "../web-src/analytics";
import App from "../web-src/App";

// Mirrors frontend/src/main.tsx (the Vite entry the shell replaces).
initAnalytics();
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 2,
    },
  },
});

export default function RecallApp({
  openExternal,
}: {
  /** Native side passes expo-web-browser's in-app browser (async across the bridge). */
  openExternal: (url: string) => Promise<void>;
  dom?: import("expo/dom").DOMProps;
}) {
  // Props arrive after module evaluation — hand the native opener to the
  // platform shim's lazy lookup (frontend/src/platform/index.ts).
  useEffect(() => {
    window.__RECALL_OPEN_EXTERNAL__ = openExternal;
    return () => {
      delete window.__RECALL_OPEN_EXTERNAL__;
    };
  }, [openExternal]);

  return (
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  );
}
