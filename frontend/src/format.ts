// Small formatting helpers for the Editorial masthead + Library/Search metadata.

import type { Content } from "./types";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * Format a 'YYYY-MM-DD' API date as e.g. "Tue, Jun 2 2026" (matches shot.png,
 * where it is then uppercased by the masthead). Parsed as a local date so the
 * day-of-week is not shifted by the timezone offset of a UTC midnight.
 */
export function formatMastheadDate(iso: string): string {
  const [y, m, d] = iso.split("-").map((n) => parseInt(n, 10));
  if (!y || !m || !d) return iso;
  const dt = new Date(y, m - 1, d);
  return `${DAYS[dt.getDay()]}, ${MONTHS[m - 1]} ${d} ${y}`;
}

/**
 * Every edition a Content appeared in, deduped by edition key, PRIMARY edition
 * first (ADR-0001 — the flat `edition` stays the displayed appearance), then the
 * remaining editions in stable appearances[] order. A Content can appear twice in
 * the SAME edition across different issues — each edition is listed ONCE.
 * Callers join with " · " for the additive multi-edition badge (#27).
 */
export function editionNames(c: Pick<Content, "edition" | "appearances">): string[] {
  const seen = new Set<string>([c.edition.key]);
  const names = [c.edition.name];
  for (const a of c.appearances) {
    if (!seen.has(a.edition.key)) {
      seen.add(a.edition.key);
      names.push(a.edition.name);
    }
  }
  return names;
}
