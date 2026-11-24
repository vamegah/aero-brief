export const AIRPORTS = [
  { id: "ATL", name: "Hartsfield-Jackson Atlanta International", artcc: "ZTL" },
  { id: "BOS", name: "Boston Logan International", artcc: "ZBW" },
  { id: "BWI", name: "Baltimore/Washington International Thurgood Marshall", artcc: "ZDC" },
  { id: "CLT", name: "Charlotte Douglas International", artcc: "ZTL" },
  { id: "DCA", name: "Ronald Reagan Washington National", artcc: "ZDC" },
  { id: "DEN", name: "Denver International", artcc: "ZDV" },
  { id: "DFW", name: "Dallas/Fort Worth International", artcc: "ZFW" },
  { id: "DTW", name: "Detroit Metropolitan Wayne County", artcc: "ZOB" },
  { id: "EWR", name: "Newark Liberty International", artcc: "ZNY" },
  { id: "FLL", name: "Fort Lauderdale-Hollywood International", artcc: "ZMA" },
  { id: "HNL", name: "Daniel K. Inouye International (Honolulu)", artcc: "ZHN" },
  { id: "IAD", name: "Washington Dulles International", artcc: "ZDC" },
  { id: "IAH", name: "George Bush Intercontinental Houston", artcc: "ZHU" },
  { id: "JFK", name: "John F. Kennedy International", artcc: "ZNY" },
  { id: "LAS", name: "Harry Reid International", artcc: "ZLA" },
  { id: "LAX", name: "Los Angeles International", artcc: "ZLA" },
  { id: "LGA", name: "New York LaGuardia", artcc: "ZNY" },
  { id: "MCO", name: "Orlando International", artcc: "ZJX" },
  { id: "MDW", name: "Chicago Midway International", artcc: "ZAU" },
  { id: "MEM", name: "Memphis International", artcc: "ZME" },
  { id: "MIA", name: "Miami International", artcc: "ZMA" },
  { id: "MSP", name: "Minneapolis-Saint Paul International", artcc: "ZMP" },
  { id: "ORD", name: "Chicago O'Hare International", artcc: "ZAU" },
  { id: "PHL", name: "Philadelphia International", artcc: "ZDC" },
  { id: "PHX", name: "Phoenix Sky Harbor International", artcc: "ZAB" },
  { id: "SAN", name: "San Diego International", artcc: "ZLA" },
  { id: "SEA", name: "Seattle-Tacoma International", artcc: "ZSE" },
  { id: "SFO", name: "San Francisco International", artcc: "ZOA" },
  { id: "SLC", name: "Salt Lake City International", artcc: "ZLC" },
  { id: "TPA", name: "Tampa International", artcc: "ZJX" },
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
