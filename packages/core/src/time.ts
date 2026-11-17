/**
 * Time rules. Pure: `now` is always passed in, Date.now() is never called.
 *
 * Inputs are ISO 8601 strings (as stored in Snapshot.capturedAt / Event.occurredAt)
 * and `now` is a Date, per design.md.
 */

/** A Snapshot older than this (strictly) is stale: 600 s = 10 minutes. Requirement 6.2. */
export const STALE_THRESHOLD_MS = 600_000;

/** Data up to and including this age is retained: 24 hours. Requirements 11.1-11.3. */
export const RETENTION_MS = 86_400_000;

/**
 * Elapsed milliseconds from `timestamp` to `now`, or NaN when either is unparseable.
 * Negative when `timestamp` is in the future.
 */
function elapsedMs(timestamp: string, now: Date): number {
  return now.getTime() - new Date(timestamp).getTime();
}

/**
 * True when `now - capturedAt > STALE_THRESHOLD_MS` (strictly greater).
 *
 * - Exactly 600 000 ms is NOT stale; 600 001 ms is stale.
 * - Future `capturedAt` (negative elapsed, e.g. clock skew): NOT stale.
 * - Unparseable `capturedAt` (or invalid `now`): stale. We cannot show the data
 *   as fresh when its age is unknown, so we fail safe.
 */
export function isStale(capturedAt: string, now: Date): boolean {
  const elapsed = elapsedMs(capturedAt, now);
  if (Number.isNaN(elapsed)) return true;
  return elapsed > STALE_THRESHOLD_MS;
}

/**
 * True when the age of `capturedAt` is at most RETENTION_MS.
 *
 * - Exactly 86 400 000 ms is within retention; 86 400 001 ms is not.
 * - Future `capturedAt` (negative age): within retention. It is not older than
 *   24 h, so it is not purged or hidden.
 * - Unparseable `capturedAt` (or invalid `now`): NOT within retention, so
 *   records with unknown age are never served as recent history.
 */
export function withinRetention(capturedAt: string, now: Date): boolean {
  const age = elapsedMs(capturedAt, now);
  if (Number.isNaN(age)) return false;
  return age <= RETENTION_MS;
}
