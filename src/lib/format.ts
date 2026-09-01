/**
 * Formatting for the dense, numeric surfaces this app is mostly made of.
 *
 * Every function here is pure and total: it takes a value and returns a string,
 * never throws, and renders a sensible placeholder for missing data. Tables call
 * these thousands of times per second during a live tap.
 */

/** Shown wherever a value is genuinely absent. An en dash, not a hyphen. */
export const EMPTY = "–";

/**
 * Compact SI-style count: `41.9k`, `2.18M`.
 *
 * Used for rates and totals in table cells where three or four characters is
 * the entire budget.
 */
export function compactNumber(value: number): string {
  if (!Number.isFinite(value)) return EMPTY;
  const abs = Math.abs(value);
  if (abs < 1_000) return String(Math.round(value));
  if (abs < 1_000_000) return `${trim(value / 1_000)}k`;
  if (abs < 1_000_000_000) return `${trim(value / 1_000_000)}M`;
  return `${trim(value / 1_000_000_000)}G`;
}

/**
 * Grouped count for prose and status bars: `2 184`.
 *
 * Grouped by hand rather than via `toLocaleString`, which picks its separator
 * from ICU data — that can be a comma, a narrow no-break space or a period
 * depending on the runtime, and the status bar needs one predictable glyph.
 */
export function groupedNumber(value: number): string {
  if (!Number.isFinite(value)) return EMPTY;
  const rounded = Math.round(Math.abs(value));
  const grouped = String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return value < 0 ? `-${grouped}` : grouped;
}

/** Byte size in binary units: `512 B`, `4.0 KiB`, `1.2 MiB`. */
export function bytes(value: number): string {
  if (!Number.isFinite(value) || value < 0) return EMPTY;
  if (value < 1024) return `${value} B`;
  const units = ["KiB", "MiB", "GiB", "TiB"] as const;
  let scaled = value / 1024;
  let unit = 0;
  while (scaled >= 1024 && unit < units.length - 1) {
    scaled /= 1024;
    unit += 1;
  }
  return `${trim(scaled)} ${units[unit]}`;
}

/** Messages per second, as the topology cards show it: `41.9k/s`. */
export function rate(perSecond: number): string {
  if (!Number.isFinite(perSecond)) return EMPTY;
  return `${compactNumber(perSecond)}/s`;
}

/** Wall-clock time of day with milliseconds: `14:03:22.481`. */
export function timeOfDay(epochMs: number): string {
  if (!Number.isFinite(epochMs) || epochMs <= 0) return EMPTY;
  const date = new Date(epochMs);
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  const ms = String(date.getMilliseconds()).padStart(3, "0");
  return `${hh}:${mm}:${ss}.${ms}`;
}

/** Elapsed time, coarsened as it grows: `4s`, `12m`, `3h 20m`, `2d 4h`. */
export function duration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return EMPTY;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

/** How long ago, for "last seen" columns: `just now`, `4m ago`. */
export function relativeTime(epochMs: number, now = Date.now()): string {
  const delta = now - epochMs;
  if (!Number.isFinite(delta)) return EMPTY;
  if (delta < 1_000) return "just now";
  return `${duration(delta)} ago`;
}

/**
 * Shortens a Zenoh id for display: `34f797e3…c1a2`.
 *
 * Keeps both ends, because zids from one deployment often share a prefix and
 * truncating only the tail would make distinct nodes look identical.
 */
export function shortZid(zid: string, head = 8, tail = 4): string {
  if (zid.length <= head + tail + 1) return zid;
  return `${zid.slice(0, head)}…${zid.slice(-tail)}`;
}

/** Splits a key expression into chunks for per-chunk rendering. */
export function keyChunks(keyExpr: string): string[] {
  return keyExpr.split("/").filter((chunk) => chunk.length > 0);
}

/** One decimal place, but only when it says something: `4` not `4.0`. */
function trim(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
