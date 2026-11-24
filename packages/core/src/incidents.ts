import type { MonitoredId } from "./airports";
import type { DetectedEvent } from "./change-detector";

/**
 * One merged incident: a GROUND_STOP_STARTED/ENDED pair (or a nationwide event)
 * sharing the same event key.
 */
export interface Incident {
  incidentKey: string; // the event key shared by the started/ended pair
  type: "GROUND_STOP_STARTED" | "NATIONWIDE_EVENT";
  airportId: MonitoredId | null;
  startedAt: string;
  endedAt: string | null; // null = active
  durationMs: number | null; // null while active
}

type KeyedEvent = DetectedEvent & { incidentKey: string };

function ms(iso: string): number {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Groups stored events by incidentKey. A GROUND_STOP_ENDED event with no matching
 * start becomes its own ended Incident with startedAt = endedAt (duration 0), so no
 * event is dropped. With several starts the earliest wins; with several ends the
 * latest wins. A NATIONWIDE_EVENT has no end event and stays active. Output follows
 * the order in which each key first appears. Requirement 2.1.
 */
export function mergeIncidents(events: readonly KeyedEvent[]): Incident[] {
  const groups = new Map<string, KeyedEvent[]>();
  for (const e of events) {
    const g = groups.get(e.incidentKey);
    if (g === undefined) groups.set(e.incidentKey, [e]);
    else g.push(e);
  }

  const out: Incident[] = [];
  for (const [incidentKey, group] of groups) {
    let start: KeyedEvent | null = null;
    let end: KeyedEvent | null = null;
    for (const e of group) {
      if (e.type === "GROUND_STOP_ENDED") {
        if (end === null || ms(e.occurredAt) > ms(end.occurredAt)) end = e;
      } else if (start === null || ms(e.occurredAt) < ms(start.occurredAt)) {
        start = e;
      }
    }

    if (start === null) {
      // Unmatched ended event: its own ended Incident.
      const e = end as KeyedEvent;
      out.push({
        incidentKey,
        type: "GROUND_STOP_STARTED",
        airportId: e.type === "GROUND_STOP_ENDED" ? e.airportId : null,
        startedAt: e.occurredAt,
        endedAt: e.occurredAt,
        durationMs: 0,
      });
      continue;
    }

    if (start.type === "NATIONWIDE_EVENT") {
      out.push({
        incidentKey,
        type: "NATIONWIDE_EVENT",
        airportId: null,
        startedAt: start.occurredAt,
        endedAt: null,
        durationMs: null,
      });
      continue;
    }

    out.push({
      incidentKey,
      type: "GROUND_STOP_STARTED",
      airportId: start.airportId,
      startedAt: start.occurredAt,
      endedAt: end === null ? null : end.occurredAt,
      durationMs: end === null ? null : Math.max(0, ms(end.occurredAt) - ms(start.occurredAt)),
    });
  }
  return out;
}

function cmpStr(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Active first, then ended by endedAt descending. Ties break on startedAt
 * descending, then incidentKey, type and airportId, so the result does not depend
 * on input order. Requirement 2.5.
 */
export function sortIncidents(incidents: readonly Incident[]): Incident[] {
  return [...incidents].sort((a, b) => {
    const aActive = a.endedAt === null;
    const bActive = b.endedAt === null;
    if (aActive !== bActive) return aActive ? -1 : 1;
    if (a.endedAt !== null && b.endedAt !== null) {
      const d = ms(b.endedAt) - ms(a.endedAt);
      if (d !== 0) return d;
      const s = cmpStr(b.endedAt, a.endedAt);
      if (s !== 0) return s;
    }
    const st = ms(b.startedAt) - ms(a.startedAt);
    if (st !== 0) return st;
    return (
      cmpStr(b.startedAt, a.startedAt) ||
      cmpStr(a.incidentKey, b.incidentKey) ||
      cmpStr(a.type, b.type) ||
      cmpStr(a.airportId ?? "", b.airportId ?? "") ||
      (a.durationMs ?? -1) - (b.durationMs ?? -1)
    );
  });
}
