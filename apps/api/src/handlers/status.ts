import {
  AIRPORTS,
  acceptAdvisoryUrl,
  RETENTION_MS,
  explain,
  isMonitoredId,
  isStale,
  nationwideStatus,
  type MonitoredId,
  type Snapshot,
} from "@aerobrief/core";
import { ApiError, jsonResponse } from "../http";
import type { Handler } from "../router";

/** Structural shape of a stored Event row (matches `StoredEvent` from `@aerobrief/db`). */
export interface StatusEventRow {
  /**
   * Stored `events.event_key`: the FAA event id for ground stops. The poller derives the ENDED key
   * from the same id as the STARTED key, so both rows share it. `NATIONWIDE:{snapshotId}` otherwise.
   */
  eventKey: string;
  type: string;
  airportId: string | null;
  occurredAt: Date;
  explanation: string;
}

/**
 * Read-only repositories the status handlers need. Both already restrict reads to the last
 * 24 h (Requirement 11.3). Injected so handlers never touch the database or the FAA directly.
 */
export interface StatusDeps {
  latestSnapshot(now: Date): Promise<Snapshot | null>;
  /** Events in the last 24 h, newest first, optionally for one airport. */
  recentEvents(now: Date, airportId?: string): Promise<readonly StatusEventRow[]>;
}

export type AirportSummary = {
  airportId: string;
  name: string;
  groundStop: { reasonText: string; expectedEnd: string | null; advisoryUrl: string | null } | null;
};
export type EventSummary = {
  /** Shared by a ground stop's STARTED and ENDED events, so clients can pair them into one incident. */
  incidentKey: string;
  type: string;
  airportId: string | null;
  occurredAt: string;
  explanation: string;
};

export type NationalStatusResponse =
  | { state: "no_data"; message: string }
  | {
      state: "ok";
      capturedAt: string;
      stale: boolean;
      airports: AirportSummary[];
      nationwide: { active: boolean; count: number; artccs: string[]; explanation: string | null };
      events: EventSummary[];
    };

export type AirportStatusResponse =
  | { state: "no_data"; message: string }
  | {
      state: "ok";
      capturedAt: string;
      stale: boolean;
      airport: AirportSummary;
      events: EventSummary[];
    };

export type HistoryResponse = { airportId: string; events: EventSummary[] };

const NO_DATA_MESSAGE = "No airport status data is available yet. Check back in a few minutes.";

function toEventSummary(e: StatusEventRow): EventSummary {
  return {
    incidentKey: e.eventKey,
    type: e.type,
    airportId: e.airportId,
    occurredAt: e.occurredAt.toISOString(),
    explanation: e.explanation,
  };
}

/** Summaries for all 30 airports, in the static list order. */
function summarizeAirports(snapshot: Snapshot): AirportSummary[] {
  const byId = new Map(snapshot.airports.map((a) => [a.airportId, a]));
  return AIRPORTS.map((airport): AirportSummary => {
    const status = byId.get(airport.id);
    const stop = status?.groundStop ?? null;
    return {
      airportId: airport.id,
      name: airport.name,
      groundStop:
        stop === null
          ? null
          : {
              // Translated, plain-language text only. Untranslated FAA text is never shown.
              reasonText: explain({
                type: "GROUND_STOP_STARTED",
                airportId: airport.id,
                occurredAt: snapshot.capturedAt,
                faaEventId: stop.faaEventId,
                reason: stop.reason,
              }),
              // Old snapshots may lack these fields. The URL is re-checked here (Requirement 17.5).
              expectedEnd: typeof stop.expectedEnd === "string" ? stop.expectedEnd : null,
              advisoryUrl: acceptAdvisoryUrl(stop.advisoryUrl),
            },
    };
  });
}

function requireMonitoredCode(raw: string | undefined): MonitoredId {
  const code = raw?.toUpperCase();
  if (code === undefined || !isMonitoredId(code)) {
    throw new ApiError(404, "airport_not_found", "That airport is not monitored by AeroBrief.");
  }
  return code;
}

export function createStatusHandlers(deps: StatusDeps): {
  health: Handler;
  national: Handler;
  airport: Handler;
  history: Handler;
} {
  const health: Handler = () => Promise.resolve(jsonResponse(200, { status: "ok" }));

  const national: Handler = async (_req, _env, ctx) => {
    const snapshot = await deps.latestSnapshot(ctx.now);
    if (snapshot === null) {
      const body: NationalStatusResponse = { state: "no_data", message: NO_DATA_MESSAGE };
      return jsonResponse(200, body);
    }
    const events = await deps.recentEvents(ctx.now);
    const status = nationwideStatus(snapshot);
    const body: NationalStatusResponse = {
      state: "ok",
      capturedAt: snapshot.capturedAt,
      stale: isStale(snapshot.capturedAt, ctx.now),
      airports: summarizeAirports(snapshot),
      nationwide: {
        active: status.active,
        count: status.count,
        artccs: [...status.artccs],
        explanation: status.active
          ? explain({
              type: "NATIONWIDE_EVENT",
              occurredAt: snapshot.capturedAt,
              count: status.count,
              affectedArtccs: [...status.artccs],
            })
          : null,
      },
      events: events.map(toEventSummary),
    };
    return jsonResponse(200, body);
  };

  const airport: Handler = async (_req, _env, ctx) => {
    const code = requireMonitoredCode(ctx.params["code"]);
    const snapshot = await deps.latestSnapshot(ctx.now);
    if (snapshot === null) {
      const body: AirportStatusResponse = { state: "no_data", message: NO_DATA_MESSAGE };
      return jsonResponse(200, body);
    }
    const events = await deps.recentEvents(ctx.now, code);
    const summary = summarizeAirports(snapshot).find((a) => a.airportId === code);
    if (summary === undefined) {
      throw new ApiError(404, "airport_not_found", "That airport is not monitored by AeroBrief.");
    }
    const body: AirportStatusResponse = {
      state: "ok",
      capturedAt: snapshot.capturedAt,
      stale: isStale(snapshot.capturedAt, ctx.now),
      airport: summary,
      events: events.map(toEventSummary),
    };
    return jsonResponse(200, body);
  };

  const history: Handler = async (_req, _env, ctx) => {
    const code = requireMonitoredCode(ctx.params["code"]);
    const floor = ctx.now.getTime() - RETENTION_MS;
    let since = floor;
    const raw = ctx.url.searchParams.get("since");
    if (raw !== null) {
      const parsed = Date.parse(raw);
      if (Number.isNaN(parsed)) {
        throw new ApiError(400, "invalid_since", "since must be an ISO 8601 date-time.");
      }
      since = Math.max(parsed, floor); // clamp to the last 24 h (Requirement 11.7)
    }
    const events = await deps.recentEvents(ctx.now, code);
    const kept = events
      .filter((e) => e.occurredAt.getTime() >= since)
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      .map(toEventSummary);
    const body: HistoryResponse = { airportId: code, events: kept };
    return jsonResponse(200, body);
  };

  return { health, national, airport, history };
}
