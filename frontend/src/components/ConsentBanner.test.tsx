// @vitest-environment jsdom
//
// ConsentBanner tests (#24, spec §12.4): exists ONLY when a PostHog key is configured;
// DEFAULT-DECLINE (Decline is the primary-styled action); Decline persists and never
// enables capture; Accept calls enableAnalytics (which persists); a stored prior choice
// or DNT means no banner. The analytics facade module is mocked — no SDK, no network.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ConsentBanner } from "./ConsentBanner";
import { getStoredConsent, storeConsent } from "../analytics/consent";

const mocks = vi.hoisted(() => ({
  hasAnalyticsKey: vi.fn(() => true),
  enableAnalytics: vi.fn(),
}));

vi.mock("../analytics", () => ({
  hasAnalyticsKey: mocks.hasAnalyticsKey,
  enableAnalytics: mocks.enableAnalytics,
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  mocks.hasAnalyticsKey.mockReset().mockReturnValue(true);
  mocks.enableAnalytics.mockReset();
});

describe("<ConsentBanner/>", () => {
  it("never renders when no PostHog key is configured", () => {
    mocks.hasAnalyticsKey.mockReturnValue(false);
    render(<ConsentBanner />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders when a key is configured and no choice is stored — Decline is the primary action", () => {
    render(<ConsentBanner />);
    expect(screen.getByRole("dialog", { name: "Analytics consent" })).toBeTruthy();

    const decline = screen.getByRole("button", { name: "Decline" });
    const accept = screen.getByRole("button", { name: "Allow analytics" });
    // DEFAULT-DECLINE: Decline gets the primary button styling; Accept is the plain one.
    expect(decline.className).toBe("rc-btn primary");
    expect(accept.className).toBe("rc-btn");
  });

  it("Decline persists 'declined', unmounts the banner, and never enables capture", () => {
    render(<ConsentBanner />);
    fireEvent.click(screen.getByRole("button", { name: "Decline" }));

    expect(getStoredConsent()).toBe("declined");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mocks.enableAnalytics).not.toHaveBeenCalled();
  });

  it("Accept calls enableAnalytics and unmounts the banner", () => {
    render(<ConsentBanner />);
    fireEvent.click(screen.getByRole("button", { name: "Allow analytics" }));

    expect(mocks.enableAnalytics).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("does not render when a prior choice is already stored", () => {
    storeConsent("declined");
    render(<ConsentBanner />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("does not render when Do-Not-Track is on (capture can never enable)", () => {
    vi.stubGlobal("navigator", { doNotTrack: "1" });
    render(<ConsentBanner />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
