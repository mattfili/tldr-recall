// Web platform impl (spec §10.3): article links open in a new browser tab.
// The in-app back-button reader is the desktop differentiator (see #5).

import type { Platform } from "./index";

export const webPlatform: Platform = {
  openExternal(url: string): void {
    window.open(url, "_blank", "noopener,noreferrer");
  },
  // #39 share-by-email: navigating to a mailto: URL hands off to the OS mail
  // client without unloading the SPA. Always present on web.
  openMailto(url: string): void {
    window.location.assign(url);
  },
  isDesktop: false,
};
