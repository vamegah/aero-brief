import type { EventSummary } from "../api/client";

/** An event whose `incidentKey` is guaranteed present. */
export type KeyedEventSummary = EventSummary & { incidentKey: string };

type EventLike = Pick<EventSummary, "type" | "airportId" | "occurredAt" | "incidentKey">;

function ms(iso: string): number {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Incident keys for a list of events, one per input index. An event that has a key keeps it
 * unchanged. For events without one (an API that does not send `incidentKey` yet), each
 * GROUND_STOP_ENDED is paired with the nearest earlier unpaired GROUND_STOP_STARTED at the same
 * airport and both get the start's key. Unpaired and other events get a key built from their
 * type, airport and time, and nationwide events get `fallback:nationwide:<time>`. Fallback keys
 * of different stops never collide: a repeat of an identical key gets a numeric suffix.
 */
export function assignIncidentKeys(events: readonly EventLike[]): string[] {
  const keys: (string | null)[] = events.map((e) => (e.incidentKey !== undefined ? e.incidentKey : null));
  const used = new Set<string>(keys.filter((k): k is string => k !== null));

  const fresh = (base: string): string => {
    let key = base;
    for (let n = 2; used.has(key); n++) key = `${base}#${n}`;
    used.add(key);
    return key;
  };

  const missing = events.map((_, i) => i).filter((i) => keys[i] === null);
  // Oldest first. At the same time a start sorts before an end, so a zero-length stop still pairs.
  missing.sort((a, b) => {
    const ea = events[a] as EventLike;
    const eb = events[b] as EventLike;
    const rank = (e: EventLike): number => (e.type === "GROUND_STOP_ENDED" ? 1 : 0);
    return ms(ea.occurredAt) - ms(eb.occurredAt) || rank(ea) - rank(eb) || a - b;
  });

  const openStarts = new Map<string, number[]>(); // airportId -> indexes of unpaired starts, oldest first
  for (const i of missing) {
    const e = events[i] as EventLike;
    if (e.type === "GROUND_STOP_STARTED" && e.airportId !== null) {
      keys[i] = fresh(`fallback:GROUND_STOP_STARTED:${e.airportId}:${e.occurredAt}`);
      const list = openStarts.get(e.airportId);
      if (list === undefined) openStarts.set(e.airportId, [i]);
      else list.push(i);
    } else if (e.type === "GROUND_STOP_ENDED" && e.airportId !== null) {
      const start = openStarts.get(e.airportId)?.pop();
      keys[i] = start !== undefined ? (keys[start] as string) : fresh(`fallback:GROUND_STOP_ENDED:${e.airportId}:${e.occurredAt}`);
    } else if (e.type === "NATIONWIDE_EVENT") {
      keys[i] = fresh(`fallback:nationwide:${e.occurredAt}`);
    } else {
      keys[i] = fresh(`fallback:${e.type}:${e.airportId ?? "none"}:${e.occurredAt}`);
    }
  }
  return keys as string[];
}

/** The same events, each with an `incidentKey`. Events that already had one are returned as is. */
export function withIncidentKeys(events: readonly EventSummary[]): KeyedEventSummary[] {
  const keys = assignIncidentKeys(events);
  return events.map((e, i) => (e.incidentKey !== undefined ? (e as KeyedEventSummary) : { ...e, incidentKey: keys[i] as string }));
}
