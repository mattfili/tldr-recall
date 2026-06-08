import { describe, expect, it } from "vitest";
import { formatMastheadDate } from "./format";

describe("formatMastheadDate", () => {
  it("formats the seeded issue date as in shot.png (uppercased by the masthead)", () => {
    // 2026-06-02 is a Tuesday — shot.png reads "TUE, JUN 2 2026".
    expect(formatMastheadDate("2026-06-02")).toBe("Tue, Jun 2 2026");
    expect(formatMastheadDate("2026-06-02").toUpperCase()).toBe("TUE, JUN 2 2026");
  });

  it("formats the founders issue date (2026-06-01, a Monday)", () => {
    expect(formatMastheadDate("2026-06-01")).toBe("Mon, Jun 1 2026");
  });

  it("returns the input unchanged for a malformed date", () => {
    expect(formatMastheadDate("nope")).toBe("nope");
  });
});
