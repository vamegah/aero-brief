/**
 * True when the airport's identifier or name contains the query, ignoring case and
 * leading or trailing spaces. An empty or whitespace-only query matches everything.
 * Pure; runs on data already loaded in the browser.
 */
export function matchesAirportSearch(
  airport: { airportId: string; name: string },
  query: string,
): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === "") return true;
  return airport.airportId.toLowerCase().includes(needle) || airport.name.toLowerCase().includes(needle);
}
