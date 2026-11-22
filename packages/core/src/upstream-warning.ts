/**
 * Rate limit for the "FAA answered non-2xx" warning log. Pure: `now` is passed in.
 * Requirements 1.3 and 2.3 of the faa-403-poller spec.
 */

const HOUR_MS = 3_600_000;

export interface PreviousPollRun {
  outcome: "success" | "failed";
  startedAt: Date;
}

/**
 * True when a warning should be logged for a failed poll at `now`.
 *
 * - No previous poll, or the previous poll did not fail: warn (first failure).
 * - Previous poll failed in an earlier or later UTC hour than `now`: warn.
 * - Previous poll failed in the same UTC hour as `now`: do not warn.
 * - An unparseable `startedAt` or `now` warns, so a failure is never hidden.
 */
export function shouldWarnUpstreamFailure(previous: PreviousPollRun | null, now: Date): boolean {
  if (previous === null || previous.outcome !== "failed") return true;
  const previousHour = Math.floor(previous.startedAt.getTime() / HOUR_MS);
  const nowHour = Math.floor(now.getTime() / HOUR_MS);
  if (Number.isNaN(previousHour) || Number.isNaN(nowHour)) return true;
  return previousHour !== nowHour;
}
