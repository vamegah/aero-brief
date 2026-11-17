import type { DetectedEvent } from "./change-detector";

/**
 * Ground stop Events are keyed by FAA_Event_ID (independent of the Snapshot);
 * a nationwide Event by the previous Snapshot id it follows (Requirement 9.9).
 */
export function eventKey(e: DetectedEvent, previousSnapshotId: string | null): string {
  return e.type === "NATIONWIDE_EVENT"
    ? `NATIONWIDE:${previousSnapshotId ?? "none"}`
    : e.faaEventId;
}

/** Dedup key for one alert: eventKey + type + user (Requirement 9.10). */
export function dedupKey(
  e: DetectedEvent,
  previousSnapshotId: string | null,
  userId: string,
): string {
  return `${eventKey(e, previousSnapshotId)}:${e.type}:${userId}`;
}
