import { describe, expect, it } from "vitest";
import { editionNames, formatMastheadDate } from "./format";
import type { Appearance, EditionRef } from "./types";

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

// ── editionNames (#27, ADR-0001 multi-edition badge) ──

const TLDR: EditionRef = { key: "tldr", name: "TLDR" };
const AI: EditionRef = { key: "ai", name: "AI" };

function appearance(edition: EditionRef, issueId: string): Appearance {
  return {
    issue: { id: issueId, issue_number: "#1", published_at: "2026-06-02" },
    edition,
    category: null,
    position: 0,
  };
}

describe("editionNames", () => {
  it("lists every edition, PRIMARY first, others in stable appearances order", () => {
    // appearances arrive [AI, TLDR] but the primary (flat edition) is TLDR — primary leads.
    const names = editionNames({
      edition: TLDR,
      appearances: [appearance(AI, "iss-a"), appearance(TLDR, "iss-b")],
    });
    expect(names).toEqual(["TLDR", "AI"]);
  });

  it("dedupes duplicate-edition appearances (same edition across two issues) to one entry", () => {
    const names = editionNames({
      edition: TLDR,
      appearances: [
        appearance(TLDR, "iss-a"),
        appearance(AI, "iss-b"),
        appearance(TLDR, "iss-c"),
      ],
    });
    expect(names).toEqual(["TLDR", "AI"]);
  });

  it("returns just the primary edition for single-appearance Content", () => {
    const names = editionNames({ edition: TLDR, appearances: [appearance(TLDR, "iss-a")] });
    expect(names).toEqual(["TLDR"]);
  });
});
