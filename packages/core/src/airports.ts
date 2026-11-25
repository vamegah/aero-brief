export const AIRPORTS = [
  { id: "ATL", name: "Hartsfield-Jackson Atlanta International", city: "Atlanta", state: "GA", artcc: "ZTL" },
  { id: "BOS", name: "Boston Logan International", city: "Boston", state: "MA", artcc: "ZBW" },
  { id: "BWI", name: "Baltimore/Washington International Thurgood Marshall", city: "Baltimore", state: "MD", artcc: "ZDC" },
  { id: "CLT", name: "Charlotte Douglas International", city: "Charlotte", state: "NC", artcc: "ZTL" },
  { id: "DCA", name: "Ronald Reagan Washington National", city: "Washington", state: "DC", artcc: "ZDC" },
  { id: "DEN", name: "Denver International", city: "Denver", state: "CO", artcc: "ZDV" },
  { id: "DFW", name: "Dallas/Fort Worth International", city: "Dallas-Fort Worth", state: "TX", artcc: "ZFW" },
  { id: "DTW", name: "Detroit Metropolitan Wayne County", city: "Detroit", state: "MI", artcc: "ZOB" },
  { id: "EWR", name: "Newark Liberty International", city: "Newark", state: "NJ", artcc: "ZNY" },
  { id: "FLL", name: "Fort Lauderdale-Hollywood International", city: "Fort Lauderdale", state: "FL", artcc: "ZMA" },
  { id: "HNL", name: "Daniel K. Inouye International (Honolulu)", city: "Honolulu", state: "HI", artcc: "ZHN" },
  { id: "IAD", name: "Washington Dulles International", city: "Washington", state: "DC", artcc: "ZDC" },
  { id: "IAH", name: "George Bush Intercontinental Houston", city: "Houston", state: "TX", artcc: "ZHU" },
  { id: "JFK", name: "John F. Kennedy International", city: "New York", state: "NY", artcc: "ZNY" },
  { id: "LAS", name: "Harry Reid International", city: "Las Vegas", state: "NV", artcc: "ZLA" },
  { id: "LAX", name: "Los Angeles International", city: "Los Angeles", state: "CA", artcc: "ZLA" },
  { id: "LGA", name: "New York LaGuardia", city: "New York", state: "NY", artcc: "ZNY" },
  { id: "MCO", name: "Orlando International", city: "Orlando", state: "FL", artcc: "ZJX" },
  { id: "MDW", name: "Chicago Midway International", city: "Chicago", state: "IL", artcc: "ZAU" },
  { id: "MEM", name: "Memphis International", city: "Memphis", state: "TN", artcc: "ZME" },
  { id: "MIA", name: "Miami International", city: "Miami", state: "FL", artcc: "ZMA" },
  { id: "MSP", name: "Minneapolis-Saint Paul International", city: "Minneapolis-Saint Paul", state: "MN", artcc: "ZMP" },
  { id: "ORD", name: "Chicago O'Hare International", city: "Chicago", state: "IL", artcc: "ZAU" },
  { id: "PHL", name: "Philadelphia International", city: "Philadelphia", state: "PA", artcc: "ZDC" },
  { id: "PHX", name: "Phoenix Sky Harbor International", city: "Phoenix", state: "AZ", artcc: "ZAB" },
  { id: "SAN", name: "San Diego International", city: "San Diego", state: "CA", artcc: "ZLA" },
  { id: "SEA", name: "Seattle-Tacoma International", city: "Seattle", state: "WA", artcc: "ZSE" },
  { id: "SFO", name: "San Francisco International", city: "San Francisco", state: "CA", artcc: "ZOA" },
  { id: "SLC", name: "Salt Lake City International", city: "Salt Lake City", state: "UT", artcc: "ZLC" },
  { id: "TPA", name: "Tampa International", city: "Tampa", state: "FL", artcc: "ZJX" },
] as const;

export type MonitoredId = (typeof AIRPORTS)[number]["id"];
export type ArtccId = string;

export const MONITORED_IDS: readonly MonitoredId[] = AIRPORTS.map((a) => a.id);

const ARTCC_BY_AIRPORT: ReadonlyMap<MonitoredId, ArtccId> = new Map(
  AIRPORTS.map((a) => [a.id, a.artcc]),
);

export function artccOf(id: MonitoredId): ArtccId {
  const artcc = ARTCC_BY_AIRPORT.get(id);
  if (artcc === undefined) throw new Error(`Unknown airport ${id}`);
  return artcc;
}

export type Airport = (typeof AIRPORTS)[number];

/** ARTCC display names used by the Explanation_Mapper. */
export const ARTCC_NAMES = {
  ZTL: "Atlanta",
  ZBW: "Boston",
  ZDC: "Washington",
  ZDV: "Denver",
  ZFW: "Fort Worth",
  ZOB: "Cleveland",
  ZNY: "New York",
  ZHU: "Houston",
  ZLA: "Los Angeles",
  ZJX: "Jacksonville",
  ZME: "Memphis",
  ZMA: "Miami",
  ZMP: "Minneapolis",
  ZAU: "Chicago",
  ZAB: "Albuquerque",
  ZSE: "Seattle",
  ZOA: "Oakland",
  ZLC: "Salt Lake City",
  ZHN: "Honolulu",
} as const satisfies Readonly<Record<Airport["artcc"], string>>;

const MONITORED_SET: ReadonlySet<string> = new Set(MONITORED_IDS);

export function isMonitoredId(value: string): value is MonitoredId {
  return MONITORED_SET.has(value);
}

export function airportById(id: MonitoredId): Airport {
  const airport = AIRPORTS.find((a) => a.id === id);
  if (airport === undefined) throw new Error(`Unknown airport ${id}`);
  return airport;
}

/** Display name for an ARTCC id. Falls back to the id for unknown centers. */
export function artccName(artcc: string): string {
  return (ARTCC_NAMES as Readonly<Record<string, string>>)[artcc] ?? artcc;
}
