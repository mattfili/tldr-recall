// loadPosthog tests (#24, spec §12.4 privacy): posthog-js is mocked (no network, no real
// SDK). Asserts init() gets the anonymous, capture-nothing-implicitly options and that
// identify() is NEVER called — the anonymous-device-id contract.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadPosthog } from "./posthog";

const posthogMock = vi.hoisted(() => ({
  init: vi.fn(),
  capture: vi.fn(),
  identify: vi.fn(),
}));

vi.mock("posthog-js", () => ({ default: posthogMock }));

beforeEach(() => {
  posthogMock.init.mockClear();
  posthogMock.capture.mockClear();
  posthogMock.identify.mockClear();
});

describe("loadPosthog", () => {
  it("inits with the key/host and the privacy options (anonymous, no autocapture)", async () => {
    await loadPosthog("phc_test", "https://us.i.posthog.com");

    expect(posthogMock.init).toHaveBeenCalledTimes(1);
    const [key, options] = posthogMock.init.mock.calls[0];
    expect(key).toBe("phc_test");
    expect(options).toMatchObject({
      api_host: "https://us.i.posthog.com",
      autocapture: false,
      capture_pageview: false,
      disable_session_recording: true,
    });
  });

  it("forwards capture to posthog.capture and NEVER calls identify()", async () => {
    const sink = await loadPosthog("phc_test", "https://us.i.posthog.com");

    sink.capture("article_open", {
      content_id: "c1",
      content_type: "repo",
      domain: "github.com",
      edition: "tldr",
      category: "tools",
      source_view: "editorial",
    });

    expect(posthogMock.capture).toHaveBeenCalledWith("article_open", {
      content_id: "c1",
      content_type: "repo",
      domain: "github.com",
      edition: "tldr",
      category: "tools",
      source_view: "editorial",
    });
    expect(posthogMock.identify).not.toHaveBeenCalled();
  });
});
