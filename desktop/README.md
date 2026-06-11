# Recall desktop (Electron shell)

Electron wrapper around the built web frontend, plus the hardened in-app
article browser (`src/browser.ts`, #25). The shell loads the frontend from one
of three places, in priority order (`src/main.ts`):

1. **Dev:** `ELECTRON_START_URL` set → `loadURL` (point it at the Vite dev
   server, e.g. `http://localhost:5173`).
2. **Packaged app** (`app.isPackaged`): `process.resourcesPath/frontend/dist/index.html`
   — staged there by electron-builder `extraResources`.
3. **Unpackaged repo checkout:** the sibling build at
   `../frontend/dist/index.html` (run `npm run build` in `frontend/` first,
   then `npm start` here).

## Dev flow

```sh
# terminal 1
cd frontend && npm run dev
# terminal 2
cd desktop && ELECTRON_START_URL=http://localhost:5173 npm start
```

## Installer builds (spec §12.1)

One command per platform, run from `desktop/`:

```sh
npm run dist        # macOS .dmg  → desktop/release/
npm run dist:win    # Windows NSIS .exe → desktop/release/  (cross-builds on macOS)
```

Each runs `vite build` in `frontend/`, `tsc` here, then electron-builder.
Output lands in `desktop/release/` (gitignored; distinct from `desktop/dist`,
the tsc output). The web bundle ships **outside** `app.asar` as an
extraResource at `Contents/Resources/frontend/dist` (mac) /
`resources/frontend/dist` (win).

### API base URL (build-time bake)

The frontend bakes `VITE_API_BASE_URL` at vite-build time
(`frontend/src/api/client.ts`); default is `http://localhost:8000`. There is
deliberately **no runtime config mechanism** in v1 — pass the env var when
cutting the build:

```sh
VITE_API_BASE_URL=https://<railway-api-url> npm run dist
```

The founder-demo build will be cut with the hosted Railway API URL once #28
lands (spec §13 decision 3: desktop talks to the hosted api service). Until
then the default build expects a local backend on `http://localhost:8000`.

## Signing & notarization (documented, NOT executed — v1 ships unsigned)

Builds succeed with **zero signing secrets**:

- **mac:** `identity: null` in `electron-builder.yml` → unsigned/ad-hoc app;
  no `notarize` key → notarization skipped. Users must right-click → Open (or
  clear the quarantine attribute) on first launch.
- **win:** `signAndEditExecutable: false` → no certificate needed and no
  winCodeSign/rcedit tooling required, which is what lets the NSIS target
  cross-build on macOS. The exe keeps the default Electron icon/metadata.

When real signing lands, gate it on env-var presence so secretless builds keep
working:

- **macOS signing:** remove `identity: null`; provide `CSC_LINK`
  (base64 .p12 of a Developer ID Application cert) + `CSC_KEY_PASSWORD`.
- **macOS notarization:** set `mac.notarize: true` and provide `APPLE_ID`,
  `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` (electron-builder runs
  notarytool + staples automatically).
- **Windows signing:** remove `signAndEditExecutable: false`; provide
  `CSC_LINK` + `CSC_KEY_PASSWORD` (code-signing cert), or configure Azure
  Trusted Signing via `win.azureSignOptions` +
  `AZURE_TENANT_ID`/`AZURE_CLIENT_ID`/`AZURE_CLIENT_SECRET`.

See also `infra/notes.md` (§ Desktop installers).

## Out of scope for v1 (noted per #29)

- **Auto-update:** none. electron-updater later (requires signed builds +
  a publish target).
- **Icons:** default Electron icon. When real icons land, put them in
  `desktop/build/` (electron-builder `buildResources`) — note that the
  repo-root `.gitignore` currently ignores `build/`, so un-ignore that path
  at the same time.
