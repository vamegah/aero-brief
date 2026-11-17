import { type ArtccId, type MonitoredId, MONITORED_IDS, artccOf } from "./airports";

import type { GroundStopInfo, Snapshot } from "./schemas";

// Types are inferred from the Zod schemas in schemas.ts (single source of truth).
export type { AirportStatus, GroundStopInfo, IdSource, Snapshot } from "./schemas";

export type GroundStopEvent = {
  type: "GROUND_STOP_STARTED" | "GROUND_STOP_ENDED";
  airportId: MonitoredId;
  occurredAt: string;
  faaEventId: string;
  reason: string | null;
};

export type NationwideEvent = {
  type: "NATIONWIDE_EVENT";
  occurredAt: string;
  count: number;
  affectedArtccs: ArtccId[];
};

export type DetectedEvent = GroundStopEvent | NationwideEvent;

export const NATIONWIDE_THRESHOLD = 3;

/** Distinct ARTCCs containing at least one airport with an active ground stop, sorted. */
export function affectedArtccs(s: Snapshot): ArtccId[] {
  const set = new Set<ArtccId>();
  for (const a of s.airports) {
    if (a.groundStop !== null) set.add(artccOf(a.airportId));
  }
  return [...set].sort();
}

export type NationwideStatus = {
  active: boolean;
  count: number;
  artccs: ArtccId[];
};

/** Nationwide status for a list of affected ARTCCs. Duplicates count once. */
export function nationwideFromCenters(centers: readonly ArtccId[]): NationwideStatus {
  const artccs = [...new Set(centers)].sort();
  return { active: artccs.length >= NATIONWIDE_THRESHOLD, count: artccs.length, artccs };
}

export function nationwideStatus(s: Snapshot): NationwideStatus {
  return nationwideFromCenters(affectedArtccs(s));
}

function activeMap(s: Snapshot | null): Map<MonitoredId, GroundStopInfo> {
  const m = new Map<MonitoredId, GroundStopInfo>();
  if (s === null) return m;
  for (const a of s.airports) {
    if (a.groundStop !== null) m.set(a.airportId, a.groundStop);
  }
  return m;
}

/**
 * Pure diff of two Snapshots. A missing previous Snapshot, or an airport absent
 * from either Snapshot, counts as "no active ground stop".
 */
export function detectChanges(current: Snapshot, previous: Snapshot | null): DetectedEvent[] {
  const cur = activeMap(current);
  const prev = activeMap(previous);
  const events: DetectedEvent[] = [];

  const ids = [...MONITORED_IDS].sort();
  for (const id of ids) {
    const c = cur.get(id);
    const p = prev.get(id);
    if (c !== undefined && p === undefined) {
      events.push({
        type: "GROUND_STOP_STARTED",
        airportId: id,
        occurredAt: current.capturedAt,
        faaEventId: c.faaEventId,
        reason: c.reason,
      });
    } else if (c === undefined && p !== undefined) {
      events.push({
        type: "GROUND_STOP_ENDED",
        airportId: id,
        occurredAt: current.capturedAt,
        faaEventId: p.faaEventId,
        reason: p.reason,
      });
    }
  }

  const now = nationwideStatus(current);
  const before = previous === null ? 0 : nationwideStatus(previous).count;
  if (now.active && before < NATIONWIDE_THRESHOLD) {
    events.push({
      type: "NATIONWIDE_EVENT",
      occurredAt: current.capturedAt,
      count: now.count,
      affectedArtccs: now.artccs,
    });
  }
  return events;
}
