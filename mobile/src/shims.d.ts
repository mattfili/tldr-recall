// Type shims for the cross-package frontend imports (see metro.config.js).
//
// - recall.css: Vite's client types declare CSS modules in frontend/; mobile's
//   tsconfig needs its own declaration (Metro bundles the CSS for real).
// - ImportMeta.env: frontend/src/env.ts is ALIASED AWAY by Metro at bundle time
//   (-> src/env.mobile.ts), but tsc still type-checks the real file.

declare module "*.css";

interface ImportMeta {
  env: Record<string, string | undefined>;
}
