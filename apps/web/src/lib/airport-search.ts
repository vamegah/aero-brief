import { airportById, isMonitoredId } from "@aerobrief/core/airports";

type SearchableAirport = { airportId: string; name: string; city?: string };

/** Lower-case, turn "/", "-", "(", ")", "," and "." into spaces, collapse whitespace, trim. */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[/\-(),.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cityOf(airport: SearchableAirport): string {
  return airport.city ?? (isMonitoredId(airport.airportId) ? airportById(airport.airportId).city : "");
}

/** True when `needle` occurs in `field` starting at a word boundary. Both are already normalized. */
function startsAWord(field: string, needle: string): boolean {
  return field.startsWith(needle) || field.includes(" " + needle);
}

/**
 * True when the airport code starts with the query, or the query starts a word (or a run of
 * words, for multi-word queries) in the name or city. Matching inside a word does not count,
 * so "las" finds Las Vegas but not Dallas or Charlotte Douglas. Case, punctuation separators
 * ("/", "-", "(", ")", ",", ".") and repeated spaces are ignored. An empty query matches
 * everything. The API summary carries no city, so when `city` is absent it is read from the
 * static registry by identifier. Pure; runs on data already loaded in the browser.
 */
export function matchesAirportSearch(airport: SearchableAirport, query: string): boolean {
  const needle = normalize(query);
  if (needle === "") return true;
  return (
    normalize(airport.airportId).startsWith(needle) ||
    startsAWord(normalize(airport.name), needle) ||
    startsAWord(normalize(cityOf(airport)), needle)
  );
}

/**
 * Orders matches for display: exact code first, then code prefix, then word-start matches.
 * The input order is kept within each group. Returns the input order for an empty query.
 */
export function rankAirportMatches<T>(
  items: readonly T[],
  query: string,
  toAirport: (item: T) => SearchableAirport,
): T[] {
  const needle = normalize(query);
  if (needle === "") return [...items];
  const group = (item: T): number => {
    const code = normalize(toAirport(item).airportId);
    if (code === needle) return 0;
    return code.startsWith(needle) ? 1 : 2;
  };
  return items
    .map((item, index) => ({ item, index, g: group(item) }))
    .sort((a, b) => a.g - b.g || a.index - b.index)
    .map((entry) => entry.item);
}
