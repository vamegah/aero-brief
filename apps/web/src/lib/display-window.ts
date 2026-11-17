/** Display window for Events: the last 24 hours (Requirements 10.3, 10.4, 11.3). */
export const DISPLAY_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Minimal shape needed to select Events for display. */
export interface TimedEvent {
  occurredAt: string;
}

/**
 * Pure selection of Events to display: drops Events older than 24 h relative to `now`
 * (and Events with an unparseable timestamp), then orders newest first.
 * An Event exactly 24 h old is kept. Does not mutate the input; the sort is stable.
 */
export function selectDisplayEvents<T extends TimedEvent>(events: readonly T[], now: Date): T[] {
  const floor = now.getTime() - DISPLAY_WINDOW_MS;
  return events
    .map((event) => ({ event, time: Date.parse(event.occurredAt) }))
    .filter((entry) => !Number.isNaN(entry.time) && entry.time >= floor)
    .sort((a, b) => b.time - a.time)
    .map((entry) => entry.event);
}
