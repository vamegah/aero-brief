export type DisplayMode = "relative" | "airport_local" | "my_local" | "utc";

export const DISPLAY_MODES: readonly DisplayMode[] = ["relative", "airport_local", "my_local", "utc"];

/** Age at which relative time switches to absolute time (Requirement 7.1). */
export const RELATIVE_THRESHOLD_MS = 48 * 60 * 60 * 1000;

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

/** Returns the stored mode when valid, otherwise "relative" (Requirements 7.3, 7.4). */
export function resolveDisplayMode(stored: string | null | undefined): DisplayMode {
  return DISPLAY_MODES.find((mode) => mode === stored) ?? "relative";
}

/** Absolute time in one zone, e.g. "Nov 13, 2026, 14:05 EST". */
function formatAbsolute(ms: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZoneName: "short",
  }).format(new Date(ms));
}

function formatRelative(ageMs: number): string {
  if (ageMs < MINUTE_MS) return "just now";
  if (ageMs < HOUR_MS) return `${Math.floor(ageMs / MINUTE_MS)} min ago`;
  return `${Math.floor(ageMs / HOUR_MS)} h ago`;
}

/**
 * Primary text for a timestamp. In "relative" mode, ages under 48 hours read
 * "25 min ago" and older ages fall back to an absolute time in the user's zone.
 * Unparseable input is returned unchanged.
 */
export function formatTimeText(
  iso: string,
  now: number,
  mode: DisplayMode,
  airportTz: string,
  userTz: string,
): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  switch (mode) {
    case "airport_local":
      return formatAbsolute(ms, airportTz);
    case "my_local":
      return formatAbsolute(ms, userTz);
    case "utc":
      return formatAbsolute(ms, "UTC");
    case "relative": {
      const age = now - ms;
      return age < RELATIVE_THRESHOLD_MS ? formatRelative(Math.max(age, 0)) : formatAbsolute(ms, userTz);
    }
  }
}

/** Three lines: airport local, user local, UTC (Requirement 7.2). */
export function formatTooltip(iso: string, airportTz: string, userTz: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  return [
    `Airport local: ${formatAbsolute(ms, airportTz)}`,
    `Your local: ${formatAbsolute(ms, userTz)}`,
    `UTC: ${formatAbsolute(ms, "UTC")}`,
  ].join("\n");
}
