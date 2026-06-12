// Metro config for the Recall mobile shell (issue #53).
//
// The web app's source is reached through the COMMITTED SYMLINK mobile/web-src ->
// ../frontend/src (Metro follows symlinks). Plain `watchFolders` pointing at the
// sibling package does NOT work here — the Expo CLI overrides it in non-workspace
// repos (probed: sibling-path imports fail in ~350ms without ever crawling).
//
// Three resolver jobs:
// 1. PIN THE SHARED DEPS: Metro realpaths the symlinked modules (proven by the env
//    alias matching real paths), so imports inside web-src resolve hierarchically
//    from frontend/ — where frontend/node_modules has its OWN react. Two reacts in
//    one bundle = invalid-hook-call crash. Bare imports of the shared libraries are
//    re-anchored to mobile/'s tree. (A blanket disableHierarchicalLookup is NOT
//    usable: npm nests transitive deps like expo/node_modules/expo-asset.)
// 2. ENV ALIAS: frontend/src/env.ts is the only file using Vite's `import.meta.env`
//    (syntax Metro cannot parse). Requests for it — under either the symlink path or
//    the real path — are rewritten to src/env.mobile.ts (same exported shape,
//    EXPO_PUBLIC_* fed).
// 3. DIRECTORY IMPORTS: the frontend uses Vite-style directory imports
//    ("../platform", "../analytics"); this Metro has no implicit /index resolution,
//    so failed relative resolutions retry with "/index".

const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, "..");
const envTargets = new Set([
  path.resolve(repoRoot, "frontend", "src", "env.ts"),
  path.resolve(projectRoot, "web-src", "env.ts"),
]);
const mobileEnv = path.resolve(projectRoot, "src", "env.mobile.ts");

const config = getDefaultConfig(projectRoot);

// Shared between the web app and the shell — must be singletons from mobile/'s tree.
const SHARED_DEPS = ["react", "react-dom", "@tanstack/react-query", "posthog-js"];
const isSharedDep = (name) =>
  SHARED_DEPS.some((dep) => name === dep || name.startsWith(`${dep}/`));

const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Re-anchor shared-library imports at the project root so web-src modules
  // (realpathed into frontend/) can never pull frontend/node_modules copies.
  const ctx = isSharedDep(moduleName)
    ? { ...context, originModulePath: path.join(projectRoot, "index.ts") }
    : context;
  const resolve = (name) =>
    defaultResolveRequest
      ? defaultResolveRequest(ctx, name, platform)
      : ctx.resolveRequest(ctx, name, platform);

  let resolved;
  try {
    resolved = resolve(moduleName);
  } catch (error) {
    if (moduleName.startsWith(".") || moduleName.startsWith("/")) {
      resolved = resolve(`${moduleName}/index`);
    } else {
      throw error;
    }
  }

  if (resolved?.type === "sourceFile" && envTargets.has(resolved.filePath)) {
    return { type: "sourceFile", filePath: mobileEnv };
  }
  return resolved;
};

module.exports = config;
