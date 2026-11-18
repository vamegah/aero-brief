import { MONITORED_IDS, isMonitoredId, type MonitoredId } from "./airports";
import { acceptAdvisoryUrl } from "./advisory-url";
import { deriveFaaEventId } from "./dedupe";
import type { AirportStatus, FaaResponse, GroundStopInfo, Snapshot } from "./schemas";

// FAA_Event_ID derivation lives in dedupe.ts; re-exported here so callers of
// normalization have a single entry point.
export { deriveFaaEventId } from "./dedupe";

/** ISO UTC with milliseconds, or null when absent or unparseable. */
function toIsoUtc(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

/**
 * Turn a validated FAA response into a stored Snapshot (Requirements 2.4, 2.5, 2.8).
 * Filters to monitored airports, merges duplicate entries (the lexicographically
 * lowest FAA_Event_ID wins among active ones), fills omitted airports with a null
 * ground stop, and sorts by airportId. Pure: inputs are not mutated.
 */
export function normalizeResponse(
  faa: FaaResponse,
  capturedAt: string,
  id: string,
  previous: Snapshot | null,
): Snapshot {
  const best = new Map<MonitoredId, GroundStopInfo>();

  for (const entry of faa) {
    const airportId = entry.airportId;
    const gs = entry.groundStop;
    if (!isMonitoredId(airportId) || gs === null || gs === undefined) continue;

    const previousEntry = previous?.airports.find((a) => a.airportId === airportId) ?? null;
    const { faaEventId, idSource } = deriveFaaEventId(airportId, gs, capturedAt, previousEntry);
    const info: GroundStopInfo = {
      faaEventId,
      idSource,
      reason: gs.impactingCondition ?? null,
      center: gs.center ?? null,
      endTime: gs.endTime ?? null,
      expectedEnd: toIsoUtc(gs.endTime) ?? toIsoUtc(gs.programExpirationTime),
      advisoryUrl: acceptAdvisoryUrl(gs.advisoryUrl),
    };

    const current = best.get(airportId);
    if (current === undefined || info.faaEventId < current.faaEventId) {
      best.set(airportId, info);
    }
  }

  const airports: AirportStatus[] = [...MONITORED_IDS]
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .map((airportId) => ({ airportId, groundStop: best.get(airportId) ?? null }));

  return { id, capturedAt, airports };
}
