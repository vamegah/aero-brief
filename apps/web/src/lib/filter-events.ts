/** `null` means "all". */
export interface EventFilter {
  airportId: string | null;
  type: string | null;
}

export const NO_EVENT_FILTER: EventFilter = { airportId: null, type: null };

/** A new array in input order. Events with no airport match only when `airportId` is null. */
export function filterEvents<T extends { type: string; airportId: string | null }>(
  events: readonly T[],
  filter: EventFilter,
): T[] {
  return events.filter(
    (event) =>
      (filter.airportId === null || event.airportId === filter.airportId) &&
      (filter.type === null || event.type === filter.type),
  );
}
