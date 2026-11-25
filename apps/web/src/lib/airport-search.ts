import { airportById, isMonitoredId } from "@aerobrief/core/airports";

/**
 * True when the airport's identifier, name or city contains the query, ignoring case and
 * leading or trailing spaces. An empty or whitespace-only query matches everything.
 * The API summary carries no city, so when `city` is absent it is read from the static
 * registry by identifier. Pure; runs on data already loaded in the browser.
 */
export function matchesAirportSearch(
  airport: { airportId: string; name: string; city?: string },
  query: string,
): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === "") return true;
  const city = airport.city ?? (isMonitoredId(airport.airportId) ? airportById(airport.airportId).city : "");
  return (
    airport.airportId.toLowerCase().includes(needle) ||
    airport.name.toLowerCase().includes(needle) ||
    city.toLowerCase().includes(needle)
  );
}
