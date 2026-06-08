// Small formatting helpers for the Editorial masthead.

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
