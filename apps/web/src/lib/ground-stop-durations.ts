import { formatDurationText } from "@aerobrief/core/format-duration";

const STARTED = "GROUND_STOP_STARTED";
const ENDED = "GROUND_STOP_ENDED";

export interface DurationEvent {
  type: string;
  airportId: string | null;
  occurredAt: string;
}

/**
 * Pairs each GROUND_STOP_ENDED Event with the most recent unpaired GROUND_STOP_STARTED Event of the
 * same airport before it (equal timestamps count as before), with no other ended Event between them.
 * Returns ended-Event index (position in `events`) -> duration in ms. Events with an unparseable
 * time or no airport are skipped.
 */
export function pairGroundStopDurations(events: readonly DurationEvent[]): Map<number, number> {
  const byAirport = new Map<string, { index: number; time: number; ended: boolean }[]>();
  events.forEach((event, index) => {
    if (event.airportId === null || (event.type !== STARTED && event.type !== ENDED)) return;
    const time = Date.parse(event.occurredAt);
    if (Number.isNaN(time)) return;
    const list = byAirport.get(event.airportId) ?? [];
    list.push({ index, time, ended: event.type === ENDED });
    byAirport.set(event.airportId, list);
  });

  const durations = new Map<number, number>();
  for (const list of byAirport.values()) {
    // Oldest first; at equal times a started Event comes before an ended one.
    list.sort((a, b) => a.time - b.time || Number(a.ended) - Number(b.ended) || b.index - a.index);
    let open: { time: number } | null = null;
    for (const item of list) {
      if (!item.ended) {
        open = item;
      } else {
        if (open !== null) durations.set(item.index, item.time - open.time);
        open = null;
      }
    }
  }
  return durations;
}

/** "Lasted less than 1 min", "Lasted 45 min", "Lasted 1 h 20 min", "Lasted 2 h". */
export function formatDuration(ms: number): string {
  return `Lasted ${formatDurationText(ms)}`;
}
