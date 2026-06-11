import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { initAnalytics } from "./analytics";
import App from "./App";

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("Root element #root not found in index.html");
}

// Select the analytics implementation once at startup (#24, spec §12.4). No key /
// declined consent / DNT ⇒ no-op and posthog-js is never even loaded.
initAnalytics();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Reads are stable within a session; avoid refetch churn during dev.
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
