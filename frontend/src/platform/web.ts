// Web platform impl (spec §10.3): article links open in a new browser tab.
// The in-app back-button reader is the desktop differentiator (see #5).

import type { Platform } from "./index";

export const webPlatform: Platform = {
  openExternal(url: string): void {
    window.open(url, "_blank", "noopener,noreferrer");
  },
  isDesktop: false,
};
