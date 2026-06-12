# Recall mobile (Expo DOM-component shell)

The existing responsive web app (`frontend/src`, reached via the committed `web-src`
symlink) wrapped as a native Expo app. One screen: a `'use dom'` component renders the
whole UI — `recall.css` rides along verbatim — against the hosted Railway API. Article
taps open the **native in-app browser** (SFSafariViewController / Custom Tabs), parity
with the desktop differentiator. Screens can migrate to native incrementally later.

## Run it

```sh
cd mobile && npm install
npx expo start          # scan the QR with Expo Go (iOS/Android), or press i/a for a simulator
```

Data comes from the hosted API by default; point elsewhere with
`EXPO_PUBLIC_API_URL=http://<your-lan-ip>:8000 npx expo start`.

## How the cross-package wiring works (gotchas live here)

- **`web-src -> ../frontend/src` symlink** — Metro follows symlinks; plain
  `watchFolders` does NOT work (the Expo CLI overrides it in non-workspace repos).
- **`metro.config.js`** pins shared deps (react, react-dom, react-query, posthog-js)
  to mobile's tree (Metro realpaths symlinked modules → frontend/node_modules would
  otherwise inject a second React), aliases `frontend/src/env.ts` (Vite-only
  `import.meta`) to `src/env.mobile.ts`, and retries failed relative imports with
  `/index` (the frontend uses Vite-style directory imports).
- **`src/bootstrap.ts`** sets `window.__RECALL_MOBILE__` before any frontend module
  evaluates; the platform shim (frontend/src/platform) picks the mobile branch and
  resolves the native `openExternal` lazily (props arrive after import time).
- The API allows the webview's origins: literal `null` (file-served release bundles)
  by default, plus a LAN-origin regex on the hosted API for Expo dev
  (`CORS_ALLOW_ORIGIN_REGEX`).

## Checks

```sh
npx tsc --noEmit        # type-checks mobile + the shared frontend tree
npx expo export         # proves both bundles (native + DOM) compile
```
