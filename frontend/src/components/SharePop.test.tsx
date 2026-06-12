// @vitest-environment jsdom
//
// SharePop behavior (#39): the targets are REAL — Copy link writes the article URL
// to the clipboard (execCommand fallback), Email opens a mailto: draft through
// platform.openMailto (copy fallback when a stale desktop shell lacks it), and
// iMessage/Slack use the documented copy-with-"Copied!" fallback. Every target
// fires the typed article_shared event through the analytics seam (#24 mock style).
// Both seams (analytics, platform) are module-mocked — no SDK, no navigation.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SharePop } from "./SharePop";
import type { Content } from "../types";

const analyticsMock = vi.hoisted(() => ({ capture: vi.fn() }));
vi.mock("../analytics", () => ({ analytics: analyticsMock }));

// platform mock with a swappable openMailto (undefined = stale desktop shell / fallback path).
const platformMock = vi.hoisted(() => ({
  openExternal: vi.fn(),
  isDesktop: false,
  openMailto: undefined as ((url: string) => void) | undefined,
}));
vi.mock("../platform", () => ({ platform: platformMock }));

const IT: Content = {
  id: "11111111-1111-1111-1111-111111111111",
  title: "Headroom — agent context compression",
  summary: "Compresses everything an agent reads.",
  content_type: "repo",
  read_minutes: null,
  url: "https://github.com/headroom",
  domain: "github.com",
  tags: ["agents"],
  resources: null,
  edition: { key: "tldr", name: "TLDR" },
  category: { slug: "tools", label: "Tools", hue: "var(--c-tools)" },
  issue: { id: "iss", issue_number: "#1", published_at: "2026-06-02" },
  appearances: [],
  starred: false,
};

/** The full article_shared payload SharePop must capture for a given target. */
function sharedProps(target: string) {
  return {
    content_id: IT.id,
    content_type: "repo",
    domain: "github.com",
    edition: "tldr",
    category: "tools",
    source_view: "editorial",
    target,
  };
}

/** jsdom has no navigator.clipboard — install a mock (restored in afterEach). */
function installClipboard() {
  const writeText = vi.fn(() => Promise.resolve());
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  return writeText;
}

function renderPop() {
  const onClose = vi.fn();
  render(<SharePop content={IT} sourceView="editorial" onClose={onClose} />);
  return onClose;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, "clipboard");
  Reflect.deleteProperty(document, "execCommand");
  platformMock.openMailto = undefined;
  analyticsMock.capture.mockClear();
});

describe("<SharePop/> (#39)", () => {
  it("Copy link writes the article URL to the clipboard, shows 'Copied!', fires article_shared, then closes", async () => {
    const writeText = installClipboard();
    const onClose = renderPop();

    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));

    expect(writeText).toHaveBeenCalledExactlyOnceWith(IT.url);
    expect(screen.getByText("Copied!")).toBeTruthy();
    expect(analyticsMock.capture).toHaveBeenCalledExactlyOnceWith(
      "article_shared",
      sharedProps("copy_link"),
    );
    expect(onClose).not.toHaveBeenCalled(); // delayed close (650ms idiom)
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("falls back to document.execCommand('copy') when the clipboard API is unavailable", () => {
    // No navigator.clipboard at all (jsdom default) — the hidden-textarea path runs.
    const execCommand = vi.fn(() => true);
    Object.defineProperty(document, "execCommand", { value: execCommand, configurable: true });
    renderPop();

    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));

    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(screen.getByText("Copied!")).toBeTruthy();
  });

  it("Email opens a mailto: draft (subject=title, body=url) via platform.openMailto and closes", () => {
    installClipboard();
    const openMailto = vi.fn();
    platformMock.openMailto = openMailto;
    const onClose = renderPop();

    fireEvent.click(screen.getByRole("button", { name: "Email" }));

    expect(openMailto).toHaveBeenCalledExactlyOnceWith(
      `mailto:?subject=${encodeURIComponent(IT.title)}&body=${encodeURIComponent(IT.url)}`,
    );
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(analyticsMock.capture).toHaveBeenCalledExactlyOnceWith(
      "article_shared",
      sharedProps("email"),
    );
  });

  it("Email without platform.openMailto (stale desktop shell) copies the link with 'Copied!'", () => {
    const writeText = installClipboard();
    renderPop(); // platformMock.openMailto is undefined

    fireEvent.click(screen.getByRole("button", { name: "Email" }));

    expect(writeText).toHaveBeenCalledExactlyOnceWith(IT.url);
    expect(screen.getByText("Copied!")).toBeTruthy();
    expect(analyticsMock.capture).toHaveBeenCalledExactlyOnceWith(
      "article_shared",
      sharedProps("email"),
    );
  });

  it("offers exactly two targets: Email and Copy link (iMessage/Slack removed)", () => {
    renderPop();

    const buttons = screen.getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual(["Email", "Copy link"]);
    expect(screen.queryByText("iMessage")).toBeNull();
    expect(screen.queryByText("Slack")).toBeNull();
  });
});
