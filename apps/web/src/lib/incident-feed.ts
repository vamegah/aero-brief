import { isMonitoredId } from "@aerobrief/core/airports";
import { mergeIncidents, sortIncidents, type Incident } from "@aerobrief/core/incidents";
import type { EventSummary } from "../api/client";
import { assignIncidentKeys, withIncidentKeys, type KeyedEventSummary } from "./fallback-incident-keys";
import type { EventFilter } from "./filter-events";

/** The event shape `mergeIncidents` takes, derived so the web app needs no deep core import. */
export type CoreIncidentEvent = Parameters<typeof mergeIncidents>[0][number];

/**
 * Maps an API event to the core event shape. Returns null for a type `mergeIncidents` does not
 * recognize, and for a ground stop event whose airport is not a monitored airport. The result
 * carries no FAA text: the `reason` is null because EventSummary does not include it.
 */
export function toCoreEvent(input: EventSummary): CoreIncidentEvent | null {
  const event: KeyedEventSummary = { ...input, incidentKey: input.incidentKey ?? (assignIncidentKeys([input])[0] as string) };
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
  others: KeyedEventSummary[];
  /**
   * Keys of ground stop incidents that started, were not active in the current snapshot and have no
   * end event to pair with. Present only when a snapshot was supplied.
   */
  endTimeNotRecorded?: ReadonlySet<string>;
}

/** Monitored airport ids whose current snapshot shows a ground stop. */
export type ActiveGroundStopMap = ReadonlySet<string>;

export function activeGroundStopIds(airports: readonly { airportId: string; groundStop: unknown }[]): ActiveGroundStopMap {
  return new Set(airports.filter((a) => a.groundStop !== null).map((a) => a.airportId));
}

function ms(iso: string): number {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
}

function byStart(a: Incident, b: Incident): number {
  return ms(a.startedAt) - ms(b.startedAt) || (a.incidentKey < b.incidentKey ? -1 : a.incidentKey > b.incidentKey ? 1 : 0);
}

/** An ended ground stop incident that `mergeIncidents` built from an end event alone. */
function isUnmatchedEnd(i: Incident): boolean {
  return i.endedAt !== null && i.durationMs === 0 && i.startedAt === i.endedAt;
}

/**
 * Reconciles merged incidents with the current snapshot (Requirements 1.1, 1.2, 1.3, 1.5).
 * Per airport, each unmatched end (processed oldest first) is paired with the nearest earlier open
 * start, even when their incident keys differ; the pair keeps the start's key. An open start left
 * over stays active only when it is the latest one and the airport is active in the snapshot.
 * Every other leftover start is marked ended with its end time not recorded (`endedAt` set to its
 * `startedAt`, duration 0). Nationwide incidents are untouched. With `active` undefined (no "ok"
 * status) the incidents come back unchanged.
 */
export function reconcileWithSnapshot(
  incidents: readonly Incident[],
  active: ActiveGroundStopMap | undefined,
): { incidents: Incident[]; endTimeNotRecorded: Set<string> } {
  const endTimeNotRecorded = new Set<string>();
  if (active === undefined) return { incidents: [...incidents], endTimeNotRecorded };

  const out: Incident[] = [];
  const byAirport = new Map<string, Incident[]>();
  for (const i of incidents) {
    if (i.type !== "GROUND_STOP_STARTED" || i.airportId === null) {
      out.push(i);
      continue;
    }
    const list = byAirport.get(i.airportId);
    if (list === undefined) byAirport.set(i.airportId, [i]);
    else list.push(i);
  }

  for (const [airportId, list] of byAirport) {
    const ends = list.filter(isUnmatchedEnd).sort((a, b) => ms(a.endedAt as string) - ms(b.endedAt as string) || byStart(a, b));
    const opens = list.filter((i) => i.endedAt === null).sort(byStart);
    for (const i of list) if (i.endedAt !== null && !isUnmatchedEnd(i)) out.push(i);

    const used = new Set<Incident>();
    for (const end of ends) {
      const endMs = ms(end.endedAt as string);
      let match: Incident | null = null;
      for (const open of opens) {
        if (used.has(open) || ms(open.startedAt) >= endMs) continue;
        match = open; // opens are ascending, so the last eligible one is the nearest earlier
      }
      if (match === null) {
        out.push(end);
        continue;
      }
      used.add(match);
      out.push({
        ...match,
        endedAt: end.endedAt,
        durationMs: Math.max(0, endMs - ms(match.startedAt)),
      });
    }

    const left = opens.filter((o) => !used.has(o));
    left.forEach((open, index) => {
      if (index === left.length - 1 && active.has(airportId)) {
        out.push(open);
        return;
      }
      endTimeNotRecorded.add(open.incidentKey);
      out.push({ ...open, endedAt: open.startedAt, durationMs: 0 });
    });
  }
  return { incidents: sortIncidents(out), endTimeNotRecorded };
}

/**
 * Builds the feed. `snapshotAirports` is the current "ok" snapshot's airports; omit it when the
 * snapshot is unavailable and an end event alone decides whether an incident has ended.
 */
export function buildIncidentFeed(
  events: readonly EventSummary[],
  snapshotAirports?: readonly { airportId: string; groundStop: unknown }[],
): IncidentFeed {
  const recognized: CoreIncidentEvent[] = [];
  const others: KeyedEventSummary[] = [];
  for (const event of withIncidentKeys(events)) {
    const core = toCoreEvent(event);
    if (core === null) others.push(event);
    else recognized.push(core);
  }
  const merged = sortIncidents(mergeIncidents(recognized));
  if (snapshotAirports === undefined) return { incidents: merged, others };
  const { incidents, endTimeNotRecorded } = reconcileWithSnapshot(merged, activeGroundStopIds(snapshotAirports));
  return { incidents, others, endTimeNotRecorded };
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
