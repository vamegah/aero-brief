import { isMonitoredId } from "@aerobrief/core/airports";
import { mergeIncidents, sortIncidents, type Incident } from "@aerobrief/core/incidents";
import type { EventSummary } from "../api/client";
import type { EventFilter } from "./filter-events";

/** The event shape `mergeIncidents` takes, derived so the web app needs no deep core import. */
export type CoreIncidentEvent = Parameters<typeof mergeIncidents>[0][number];

/**
 * Maps an API event to the core event shape. Returns null for a type `mergeIncidents` does not
 * recognize, and for a ground stop event whose airport is not a monitored airport. The result
 * carries no FAA text: the `reason` is null because EventSummary does not include it.
 */
export function toCoreEvent(event: EventSummary): CoreIncidentEvent | null {
  switch (event.type) {
    case "GROUND_STOP_STARTED":
    case "GROUND_STOP_ENDED":
      if (event.airportId === null || !isMonitoredId(event.airportId)) return null;
      return {
        type: event.type,
        airportId: event.airportId,
        occurredAt: event.occurredAt,
        faaEventId: event.incidentKey,
        reason: null,
        incidentKey: event.incidentKey,
      };
    case "NATIONWIDE_EVENT":
      return {
        type: "NATIONWIDE_EVENT",
        occurredAt: event.occurredAt,
        count: 0,
        affectedArtccs: [],
        incidentKey: event.incidentKey,
      };
    default:
      return null;
  }
}

/** Incidents (sorted active first, then most recent end) plus the events of any other type. */
export interface IncidentFeed {
  incidents: Incident[];
  /** Events `toCoreEvent` rejected. They render with `EventCard`, newest first as received. */
  others: EventSummary[];
}

export function buildIncidentFeed(events: readonly EventSummary[]): IncidentFeed {
  const recognized: CoreIncidentEvent[] = [];
  const others: EventSummary[] = [];
  for (const event of events) {
    const core = toCoreEvent(event);
    if (core === null) others.push(event);
    else recognized.push(core);
  }
  return { incidents: sortIncidents(mergeIncidents(recognized)), others };
}

/** Number of cards the feed renders. */
export function feedSize(feed: IncidentFeed): number {
  return feed.incidents.length + feed.others.length;
}

/**
 * Applies the Events pane filters to incidents. The airport filter matches the incident's airport
 * (a system-wide incident has none, so it matches only "all airports"). The type filter keeps the
 * event-type options: "Ground stop started" matches every ground stop incident, "Ground stop ended"
 * matches ground stop incidents that have ended, "System-wide disruption" matches nationwide ones.
 * The state filter keeps incidents that are still active (no end) or that have ended.
 */
export function filterIncidentFeed(feed: IncidentFeed, filter: EventFilter): IncidentFeed {
  const airportOk = (airportId: string | null): boolean => filter.airportId === null || airportId === filter.airportId;
  const typeOk = (incident: Incident): boolean => {
    if (filter.type === null) return true;
    if (filter.type === "GROUND_STOP_ENDED") {
      return incident.type === "GROUND_STOP_STARTED" && incident.endedAt !== null;
    }
    return incident.type === filter.type;
  };
  const state = filter.state ?? null;
  const stateOk = (incident: Incident): boolean =>
    state === null || (state === "active" ? incident.endedAt === null : incident.endedAt !== null);
  return {
    incidents: feed.incidents.filter((i) => airportOk(i.airportId) && typeOk(i) && stateOk(i)),
    // Events of an unrecognised type have no active or ended state, so a state filter hides them.
    others: feed.others.filter(
      (e) => state === null && airportOk(e.airportId) && (filter.type === null || e.type === filter.type),
    ),
  };
}

/** First `count` cards: incidents first (already sorted), then other events. */
export function limitFeed(feed: IncidentFeed, count: number): IncidentFeed {
  const incidents = feed.incidents.slice(0, count);
  return { incidents, others: feed.others.slice(0, Math.max(0, count - incidents.length)) };
}

/**
 * Keys of the incidents that are the latest ended one of their airport. Only these can describe
 * the airport's current recovery.
 */
export function latestEndedKeys(incidents: readonly Incident[]): Set<string> {
  const best = new Map<string, { key: string; ms: number }>();
  for (const i of incidents) {
    if (i.airportId === null || i.endedAt === null) continue;
    const ms = Date.parse(i.endedAt);
    const cur = best.get(i.airportId);
    if (cur === undefined || ms > cur.ms) best.set(i.airportId, { key: i.incidentKey, ms });
  }
  return new Set([...best.values()].map((b) => b.key));
}
