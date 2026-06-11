// @vitest-environment jsdom
//
// Chrome bar for the desktop in-app browser (#25): subscribes to bridge state,
// renders nothing when closed / on web, and wires every control to the
// preload bridge (Back-to-Recall → close, site back/forward gated by
// canGoBack/canGoForward, reload, open-in-system). The bridge is a mock —
// no Electron in jsdom. (No jest-dom in this repo: assertions use plain DOM.)

import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { BrowserChrome } from "./BrowserChrome";
import type { BrowserState, RecallBridge } from "../platform";

type StateCb = (s: BrowserState) => void;

function makeBridge() {
  let cb: StateCb | null = null;
  const unsubscribe = vi.fn(() => {
    cb = null;
  });
  const browser = {
    open: vi.fn(),
    close: vi.fn(),
    reload: vi.fn(),
    goBack: vi.fn(),
    goForward: vi.fn(),
    openInSystem: vi.fn(),
    onState: vi.fn((fn: StateCb) => {
      cb = fn;
      return unsubscribe;
    }),
  };
  const push = (s: BrowserState) => act(() => cb?.(s));
  const bridge: RecallBridge = { isDesktop: true, browser };
  return { bridge, browser, push, unsubscribe };
}

const OPEN_STATE: BrowserState = {
  open: true,
  url: "https://www.example.com/articles/1",
  domain: "example.com",
  canGoBack: true,
  canGoForward: false,
};

const button = (name: string) => screen.getByRole("button", { name }) as HTMLButtonElement;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("<BrowserChrome/> (#25)", () => {
  it("renders nothing when there is no preload bridge (web build)", () => {
    const { container } = render(<BrowserChrome />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing until the bridge pushes an open state", () => {
    const { bridge, browser } = makeBridge();
    vi.stubGlobal("recall", bridge);
    const { container } = render(<BrowserChrome />);
    expect(browser.onState).toHaveBeenCalledTimes(1);
    expect(container.firstChild).toBeNull();
  });

  it("shows the domain (full URL in the title attr) when open", () => {
    const { bridge, push } = makeBridge();
    vi.stubGlobal("recall", bridge);
    render(<BrowserChrome />);
    push(OPEN_STATE);

    const domain = screen.getByText("example.com");
    expect(domain.getAttribute("title")).toBe("https://www.example.com/articles/1");
    expect(screen.getByRole("toolbar", { name: "In-app browser controls" })).toBeTruthy();
  });

  it("Back to Recall calls bridge.close()", () => {
    const { bridge, browser, push } = makeBridge();
    vi.stubGlobal("recall", bridge);
    render(<BrowserChrome />);
    push(OPEN_STATE);

    fireEvent.click(button("Back to Recall"));
    expect(browser.close).toHaveBeenCalledTimes(1);
  });

  it("reload and open-in-system call the bridge", () => {
    const { bridge, browser, push } = makeBridge();
    vi.stubGlobal("recall", bridge);
    render(<BrowserChrome />);
    push(OPEN_STATE);

    fireEvent.click(button("Reload page"));
    fireEvent.click(button("Open in system browser"));
    expect(browser.reload).toHaveBeenCalledTimes(1);
    expect(browser.openInSystem).toHaveBeenCalledTimes(1);
  });

  it("site back/forward follow canGoBack/canGoForward (disabled buttons do nothing)", () => {
    const { bridge, browser, push } = makeBridge();
    vi.stubGlobal("recall", bridge);
    render(<BrowserChrome />);
    push(OPEN_STATE); // canGoBack: true, canGoForward: false

    expect(button("Site back").disabled).toBe(false);
    expect(button("Site forward").disabled).toBe(true);

    fireEvent.click(button("Site back"));
    fireEvent.click(button("Site forward"));
    expect(browser.goBack).toHaveBeenCalledTimes(1);
    expect(browser.goForward).not.toHaveBeenCalled();

    push({ ...OPEN_STATE, canGoBack: false, canGoForward: true });
    expect(button("Site back").disabled).toBe(true);
    fireEvent.click(button("Site forward"));
    expect(browser.goForward).toHaveBeenCalledTimes(1);
  });

  it("disappears again when the bridge pushes a closed state", () => {
    const { bridge, push } = makeBridge();
    vi.stubGlobal("recall", bridge);
    const { container } = render(<BrowserChrome />);
    push(OPEN_STATE);
    expect(screen.getByText("example.com")).toBeTruthy();

    push({ open: false, url: "", domain: "", canGoBack: false, canGoForward: false });
    expect(container.firstChild).toBeNull();
  });

  it("unsubscribes from state pushes on unmount", () => {
    const { bridge, unsubscribe } = makeBridge();
    vi.stubGlobal("recall", bridge);
    const { unmount } = render(<BrowserChrome />);
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
