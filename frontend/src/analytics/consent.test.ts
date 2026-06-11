// @vitest-environment jsdom
//
// Consent storage + DNT detection tests (#24). Storage mirrors the usePrefs localStorage
// idiom: null until a choice is stored, corrupt values tolerated (treated as no choice —
// the safe, declined-by-default state).

import { afterEach, describe, expect, it, vi } from "vitest";
import { getStoredConsent, isDntEnabled, storeConsent } from "./consent";

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("consent storage", () => {
  it("defaults to null when nothing is stored (banner shows, capture stays off)", () => {
    expect(getStoredConsent()).toBeNull();
  });

  it("round-trips accepted and declined", () => {
    storeConsent("declined");
    expect(getStoredConsent()).toBe("declined");
    storeConsent("accepted");
    expect(getStoredConsent()).toBe("accepted");
  });

  it("tolerates corrupt stored values (treated as no choice)", () => {
    localStorage.setItem("recall-analytics-consent", '{"weird":true}');
    expect(getStoredConsent()).toBeNull();
  });
});

describe("isDntEnabled", () => {
  it("is false when the browser exposes no DNT signal (jsdom default)", () => {
    expect(isDntEnabled()).toBe(false);
  });

  it('is true when navigator.doNotTrack === "1"', () => {
    vi.stubGlobal("navigator", { doNotTrack: "1" });
    expect(isDntEnabled()).toBe(true);
  });

  it('is true for the legacy "yes" spelling', () => {
    vi.stubGlobal("navigator", { doNotTrack: "yes" });
    expect(isDntEnabled()).toBe(true);
  });

  it('is false when DNT is explicitly off ("0")', () => {
    vi.stubGlobal("navigator", { doNotTrack: "0" });
    expect(isDntEnabled()).toBe(false);
  });
});
