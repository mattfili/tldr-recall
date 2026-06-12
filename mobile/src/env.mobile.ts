// Metro-side replacement for frontend/src/env.ts (see metro.config.js).
// Same exported shape; values come from EXPO_PUBLIC_* env vars, defaulting to
// the hosted Railway API so the shell works out of the box.

export const env = {
  apiBaseUrl:
    process.env.EXPO_PUBLIC_API_URL ?? "https://api-production-9cb1.up.railway.app",
  posthogKey: process.env.EXPO_PUBLIC_POSTHOG_KEY as string | undefined,
  posthogHost: process.env.EXPO_PUBLIC_POSTHOG_HOST as string | undefined,
};
