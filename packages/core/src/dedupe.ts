import type { MonitoredId } from "./airports";
import type { AirportStatus, DetectedEvent, IdSource } from "./change-detector";
import { dedupKey } from "./event-keys";

/** Subset of the FAA groundStop object used to derive an FAA_Event_ID. */
export type FaaGroundStopInput = {
  id?: string | number | null;
  startTime?: string | null;
};

export type DerivedEventId = { faaEventId: string; idSource: IdSource };

/**
 * Derive the FAA_Event_ID (Requirement 9.10, Assumption 7). First matching rule wins:
 *  1. groundStop.id present and not blank      -> "faa:{id}"
 *  2. groundStop.startTime parses as a date    -> "start:{airport}:{ISO UTC ms}"
 *  3. otherwise                                -> "seen:{airport}:{capturedAt}", carried
 *     forward from the previous Snapshot while the same stop stays active.
 */
export function deriveFaaEventId(
  airportId: MonitoredId,
  gs: FaaGroundStopInput,
  capturedAt: string,
  previousEntry: AirportStatus | null,
): DerivedEventId {
  if (gs.id !== null && gs.id !== undefined) {
    const id = String(gs.id).trim();
    if (id !== "") return { faaEventId: `faa:${id}`, idSource: "faa_id" };
  }
  if (gs.startTime !== null && gs.startTime !== undefined) {
    const t = new Date(gs.startTime);
    if (!Number.isNaN(t.getTime())) {
      return { faaEventId: `start:${airportId}:${t.toISOString()}`, idSource: "start_time" };
    }
  }
  const prev = previousEntry?.groundStop;
  if (prev && prev.idSource === "first_seen") {
    return { faaEventId: prev.faaEventId, idSource: "first_seen" };
  }
  return { faaEventId: `seen:${airportId}:${capturedAt}`, idSource: "first_seen" };
}

export type AlertCandidate = {
  event: DetectedEvent;
  previousSnapshotId: string | null;
  userId: string;
};

/**
 * Pure model of the alert_log claim (INSERT ... ON CONFLICT DO NOTHING RETURNING).
 * Returns the candidates that may be sent and the updated set of claimed keys.
 * Candidates whose key is already claimed, or repeated within the batch, are dropped.
 */
export function claimAlerts(
  candidates: readonly AlertCandidate[],
  alreadyClaimed: ReadonlySet<string>,
): { toSend: AlertCandidate[]; claimed: Set<string> } {
  const claimed = new Set(alreadyClaimed);
  const toSend: AlertCandidate[] = [];
  for (const c of candidates) {
    const key = dedupKey(c.event, c.previousSnapshotId, c.userId);
    if (claimed.has(key)) continue;
    claimed.add(key);
    toSend.push(c);
  }
  return { toSend, claimed };
}
