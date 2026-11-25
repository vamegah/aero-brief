import { isMonitoredId, type MonitoredId } from "@aerobrief/core/airports";
import { deriveAirportStatus, type DerivedAirportStatus } from "@aerobrief/core/status-derivation";

const STARTED = "GROUND_STOP_STARTED";
const ENDED = "GROUND_STOP_ENDED";

export interface StatusAirport {
  airportId: string;
  groundStop: unknown;
}

export interface StatusEvent {
  type: string;
  airportId: string | null;
  occurredAt: string;
}

interface AirportEventTimes {
  lastEndedAt: string;
  /** Newest start at or before the end, or null when the start is outside the retained events. */
  lastStartedAt: string | null;
  /** Duration of the ended stop in ms, or null when the start is unknown. */
  lastEndedDurationMs: number | null;
}

/** Per airport: newest ended time, and the newest start at or before it. */
function eventTimesByAirport(events: readonly StatusEvent[]): Map<string, AirportEventTimes> {
  const ended = new Map<string, number>();
  for (const e of events) {
    const t = Date.parse(e.occurredAt);
    if (e.airportId === null || e.type !== ENDED || Number.isNaN(t)) continue;
    if (t > (ended.get(e.airportId) ?? -Infinity)) ended.set(e.airportId, t);
  }
  const started = new Map<string, number>();
  for (const e of events) {
    const t = Date.parse(e.occurredAt);
    const endMs = e.airportId === null ? undefined : ended.get(e.airportId);
    if (e.airportId === null || e.type !== STARTED || Number.isNaN(t) || endMs === undefined || t > endMs) continue;
    if (t > (started.get(e.airportId) ?? -Infinity)) started.set(e.airportId, t);
  }
  const result = new Map<string, AirportEventTimes>();
  for (const [id, endMs] of ended) {
    const startMs = started.get(id);
    result.set(id, {
      lastEndedAt: new Date(endMs).toISOString(),
      lastStartedAt: startMs === undefined ? null : new Date(startMs).toISOString(),
      lastEndedDurationMs: startMs === undefined ? null : endMs - startMs,
    });
  }
  return result;
}

/**
 * The one place the web app asks `deriveAirportStatus` for a status. The Overview, the Airports
 * table and the watchlist all read this result, so no surface computes its own recovery window.
 * Airports with an id outside the monitored set are skipped.
 */
export function airportStatusById(input: {
  airports: readonly StatusAirport[];
  events: readonly StatusEvent[];
  hasData: boolean;
  now: Date;
}): Map<string, DerivedAirportStatus> {
  const times = eventTimesByAirport(input.events);
  const result = new Map<string, DerivedAirportStatus>();
  for (const airport of input.airports) {
    if (!isMonitoredId(airport.airportId)) continue;
    const t = times.get(airport.airportId);
    result.set(
      airport.airportId,
      deriveAirportStatus({
        airportId: airport.airportId as MonitoredId,
        hasData: input.hasData,
        activeGroundStop: airport.groundStop !== null,
        lastEndedAt: t?.lastEndedAt ?? null,
        lastStartedAt: t?.lastStartedAt ?? null,
        lastEndedDurationMs: t?.lastEndedDurationMs ?? null,
        now: input.now,
      }),
    );
  }
  return result;
}
