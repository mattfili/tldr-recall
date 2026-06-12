// @vitest-environment jsdom
//
// Platform selection (spec §10.3, #25). `platform` is computed at module
// import time, so each case resets the module registry and stubs
// window.recall BEFORE the dynamic import.

import { afterEach, describe, expect, it, vi } from "vitest";
import type { RecallBridge } from "./index";

function makeBrowserMock() {
  return {
    open: vi.fn(),
    close: vi.fn(),
    reload: vi.fn(),
    goBack: vi.fn(),
    goForward: vi.fn(),
    openInSystem: vi.fn(),
    onState: vi.fn(() => () => {}),
  };
}

async function importPlatform() {
  vi.resetModules();
  return (await import("./index")).platform;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("platform selection (§10.3)", () => {
  it("selects the Electron impl when the preload bridge exposes .browser", async () => {
    const browser = makeBrowserMock();
    const bridge: RecallBridge = { isDesktop: true, browser };
    vi.stubGlobal("recall", bridge);

    const platform = await importPlatform();
    expect(platform.isDesktop).toBe(true);

    platform.openExternal("https://example.com/a");
    expect(browser.open).toHaveBeenCalledExactlyOnceWith("https://example.com/a");
  });

  it("falls back to web (new tab) when there is no bridge", async () => {
    const open = vi.fn();
    vi.stubGlobal("open", open);

    const platform = await importPlatform();
    expect(platform.isDesktop).toBe(false);

    platform.openExternal("https://example.com/a");
    expect(open).toHaveBeenCalledExactlyOnceWith(
      "https://example.com/a",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("falls back to web when the bridge exists but has no browser surface (stale M0 shell)", async () => {
    vi.stubGlobal("recall", { isDesktop: true } satisfies RecallBridge);
    const open = vi.fn();
    vi.stubGlobal("open", open);

    const platform = await importPlatform();
    expect(platform.isDesktop).toBe(false);

    platform.openExternal("https://example.com/a");
    expect(open).toHaveBeenCalledTimes(1);
  });
});

describe("openMailto detection (#39 share-by-email)", () => {
  it("exposes openMailto when the bridge has the system surface", async () => {
    const system = { openMailto: vi.fn() };
    const bridge: RecallBridge = { isDesktop: true, browser: makeBrowserMock(), system };
    vi.stubGlobal("recall", bridge);

    const platform = await importPlatform();
    expect(platform.openMailto).toBeDefined();

    platform.openMailto?.("mailto:?subject=Hi&body=https%3A%2F%2Fx");
    expect(system.openMailto).toHaveBeenCalledExactlyOnceWith(
      "mailto:?subject=Hi&body=https%3A%2F%2Fx",
    );
  });

  it("leaves openMailto undefined on a desktop bridge WITHOUT the system surface (stale shell)", async () => {
    const bridge: RecallBridge = { isDesktop: true, browser: makeBrowserMock() };
    vi.stubGlobal("recall", bridge);

    const platform = await importPlatform();
    expect(platform.isDesktop).toBe(true); // browser surface present — Electron impl selected
    expect(platform.openMailto).toBeUndefined(); // SharePop must use the copy fallback
  });

  it("always exposes openMailto on web", async () => {
    const platform = await importPlatform();
    expect(platform.isDesktop).toBe(false);
    expect(typeof platform.openMailto).toBe("function");
  });
});
