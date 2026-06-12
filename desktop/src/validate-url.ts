// URL validation for the in-app browser (#25, spec §10.4).
//
// PURE module on purpose: no Electron imports, so it compiles to plain JS and
// is testable with `node --test` (see validate-url.test.ts) without booting
// Electron. browser.ts is the only production consumer.

/**
 * Validate + normalize a URL destined for external content (the in-app
 * WebContentsView or shell.openExternal).
 *
 * ONLY http(s) is allowed — file://, javascript:, data:, about:, custom
 * schemes, protocol-relative strings and garbage all return null. On success
 * returns the normalized form (`new URL(...).toString()`).
 */
export function validateExternalUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  return url.toString();
}

/**
 * Validate + normalize a URL destined for the SYSTEM handler ONLY (#39 share-
 * by-email: shell.openExternal, never the in-app WebContentsView).
 *
 * ONLY mailto: is allowed — a deliberately separate, tighter gate so the
 * http(s)-only posture of validateExternalUrl (above) is untouched. Everything
 * else (http, https, javascript:, file:, garbage, non-strings) returns null.
 */
export function validateMailtoUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "mailto:") return null;
  return url.toString();
}

/** Display domain for the chrome bar: hostname with a leading "www." stripped. */
export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
