/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the Recall FastAPI backend. Defaults to localhost:8000. */
  readonly VITE_API_BASE_URL?: string;
  /** PostHog project key (spec §12.4). Unset ⇒ analytics is a hard no-op. */
  readonly VITE_POSTHOG_KEY?: string;
  /** PostHog ingestion host. Defaults to https://us.i.posthog.com. */
  readonly VITE_POSTHOG_HOST?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
