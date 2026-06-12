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
 * Compact relative recency for the search metadata cluster (#42). Parses a
 * 'YYYY-MM-DD' API date as a LOCAL date (same idiom as formatMastheadDate;
 * malformed input is returned unchanged) and renders, relative to `now`
 * (injectable for tests, defaults to the real clock):
 *   - same day or future  -> "today"
 *   - 1–6 days ago        -> "3d ago"
 *   - >=7 days, same year -> "May 28"
 *   - earlier years       -> "Dec 12 '25"
 */
export function formatRecency(iso: string, now: Date = new Date()): string {
  const [y, m, d] = iso.split("-").map((n) => parseInt(n, 10));
  if (!y || !m || !d) return iso;
  const published = new Date(y, m - 1, d);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayDiff = Math.round((startOfToday.getTime() - published.getTime()) / 86_400_000);
  if (dayDiff <= 0) return "today";
  if (dayDiff < 7) return `${dayDiff}d ago`;
  if (y === now.getFullYear()) return `${MONTHS[m - 1]} ${d}`;
  return `${MONTHS[m - 1]} ${d} '${String(y % 100).padStart(2, "0")}`;
}

/**
 * The Content's LATEST release date — the max issue published_at across its
 * appearances (#51). ADR-0001: the flat `issue` is the PRIMARY (earliest)
 * appearance, so a recycled story's primary date understates how recently it
 * ran; the Library date column wants the most recent sighting. Falls back to
 * the primary issue's date when appearances[] is empty (defensive only —
 * every Content has at least one appearance).
 */
export function latestPublishedAt(c: Pick<Content, "issue" | "appearances">): string {
  let latest = c.issue.published_at;
  for (const a of c.appearances) {
    if (a.issue.published_at > latest) latest = a.issue.published_at; // ISO dates sort lexically
  }
  return latest;
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
