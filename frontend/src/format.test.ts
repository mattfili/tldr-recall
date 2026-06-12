import { describe, expect, it } from "vitest";
import { editionNames, formatMastheadDate, formatRecency, latestPublishedAt } from "./format";
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

// ── formatRecency (#42, search metadata cluster) — `now` injected for determinism ──

describe("formatRecency", () => {
  const NOW = new Date(2026, 5, 12, 14, 30); // local Fri Jun 12 2026, mid-afternoon

  it("renders the same day (and future dates) as 'today'", () => {
    expect(formatRecency("2026-06-12", NOW)).toBe("today");
    expect(formatRecency("2026-06-13", NOW)).toBe("today");
  });

  it("renders 1–6 days ago relatively", () => {
    expect(formatRecency("2026-06-11", NOW)).toBe("1d ago");
    expect(formatRecency("2026-06-09", NOW)).toBe("3d ago");
    expect(formatRecency("2026-06-06", NOW)).toBe("6d ago"); // boundary: still relative
  });

  it("switches to a compact same-year date at exactly 7 days", () => {
    expect(formatRecency("2026-06-05", NOW)).toBe("Jun 5"); // boundary: 7d -> date
    expect(formatRecency("2026-05-28", NOW)).toBe("May 28");
  });

  it("shows a two-digit year for earlier years", () => {
    expect(formatRecency("2025-12-12", NOW)).toBe("Dec 12 '25");
    // a January `now` with a December publish is still cross-year
    expect(formatRecency("2025-12-30", new Date(2026, 0, 15))).toBe("Dec 30 '25");
    expect(formatRecency("2019-01-02", NOW)).toBe("Jan 2 '19");
  });

  it("returns malformed input unchanged (formatMastheadDate idiom)", () => {
    expect(formatRecency("nope", NOW)).toBe("nope");
    expect(formatRecency("", NOW)).toBe("");
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

describe("latestPublishedAt (#51)", () => {
  const c = (primary: string, dates: string[]) => ({
    issue: { id: "i", issue_number: null, published_at: primary },
    appearances: dates.map((d, n) => ({
      issue: { id: `i${n}`, issue_number: null, published_at: d },
      edition: { key: "tldr", name: "TLDR" },
      category: null,
      position: n,
    })),
  });

  it("returns the max appearance date for a recycled story", () => {
    expect(latestPublishedAt(c("2026-06-02", ["2026-06-02", "2026-06-09"]))).toBe("2026-06-09");
  });

  it("returns the primary date for a single appearance", () => {
    expect(latestPublishedAt(c("2026-06-02", ["2026-06-02"]))).toBe("2026-06-02");
  });

  it("compares ISO dates correctly across a year boundary (lexical order)", () => {
    expect(latestPublishedAt(c("2025-12-30", ["2025-12-30", "2026-01-02"]))).toBe("2026-01-02");
  });

  it("falls back to the primary date when appearances is empty (defensive)", () => {
    expect(latestPublishedAt(c("2026-06-02", []))).toBe("2026-06-02");
  });
});
