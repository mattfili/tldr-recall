// node --test suite for the pure URL validation helpers (#25, spec §10.4).
// Runs against the tsc output: `npm test` → build, then
// `node --test dist/validate-url.test.js`. No Electron, no extra deps.

import { test } from "node:test";
import assert from "node:assert/strict";
import { domainOf, validateExternalUrl } from "./validate-url";

test("accepts and normalizes http(s) URLs", () => {
  assert.equal(validateExternalUrl("https://example.com/a?b=c"), "https://example.com/a?b=c");
  assert.equal(validateExternalUrl("http://example.com"), "http://example.com/");
  // normalization: uppercase scheme/host folded, default port dropped
  assert.equal(validateExternalUrl("HTTPS://Example.COM:443/x"), "https://example.com/x");
});

test("rejects every non-http(s) scheme", () => {
  for (const bad of [
    "file:///etc/passwd",
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "about:blank",
    "chrome://settings",
    "vbscript:msgbox(1)",
    "ftp://example.com/file",
    "recall://internal",
    "blob:https://example.com/uuid",
  ]) {
    assert.equal(validateExternalUrl(bad), null, `should reject ${bad}`);
  }
});

test("rejects garbage, empties, relative and protocol-relative strings", () => {
  assert.equal(validateExternalUrl(""), null);
  assert.equal(validateExternalUrl("   "), null);
  assert.equal(validateExternalUrl("not a url"), null);
  assert.equal(validateExternalUrl("example.com/path"), null);
  assert.equal(validateExternalUrl("//example.com/path"), null);
  assert.equal(validateExternalUrl("/relative/path"), null);
});

test("rejects non-string payloads (IPC is untrusted input)", () => {
  assert.equal(validateExternalUrl(null), null);
  assert.equal(validateExternalUrl(undefined), null);
  assert.equal(validateExternalUrl(42), null);
  assert.equal(validateExternalUrl({ url: "https://example.com" }), null);
});

test("domainOf returns the hostname with leading www. stripped", () => {
  assert.equal(domainOf("https://www.example.com/a/b"), "example.com");
  assert.equal(domainOf("https://news.ycombinator.com/item?id=1"), "news.ycombinator.com");
  assert.equal(domainOf("https://wwwx.example.com"), "wwwx.example.com");
  assert.equal(domainOf("garbage"), "");
});
