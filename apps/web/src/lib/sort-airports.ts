/**
 * Orders airports for the status table: airports with an active ground stop
 * first, then ascending by airport id within each group. Pure and stable;
 * the input is not mutated.
 */
export function sortAirports<T extends { airportId: string; groundStop: unknown }>(
  airports: readonly T[],
): T[] {
  return airports
    .map((airport, index) => ({ airport, index }))
    .sort((a, b) => {
      const aStop = a.airport.groundStop !== null ? 0 : 1;
      const bStop = b.airport.groundStop !== null ? 0 : 1;
      if (aStop !== bStop) return aStop - bStop;
      if (a.airport.airportId < b.airport.airportId) return -1;
      if (a.airport.airportId > b.airport.airportId) return 1;
      return a.index - b.index;
    })
    .map((entry) => entry.airport);
}
