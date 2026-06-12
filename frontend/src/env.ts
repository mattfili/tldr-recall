// Build-environment indirection — the ONLY file allowed to touch import.meta.env.
//
// `import.meta` is Vite-only syntax: the Expo mobile shell (mobile/) bundles this
// same source tree with Metro, which cannot parse it. Vite uses this file as-is;
// mobile/metro.config.js ALIASES this module path to mobile/src/env.mobile.ts
// (same exported shape, fed by EXPO_PUBLIC_* vars / the hosted API default).
// Keep the exports in sync with that shim when changing anything here.

export const env = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000",
  posthogKey: import.meta.env.VITE_POSTHOG_KEY as string | undefined,
  posthogHost: import.meta.env.VITE_POSTHOG_HOST as string | undefined,
};
