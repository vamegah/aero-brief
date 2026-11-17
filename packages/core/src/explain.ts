import { airportById, artccName } from "./airports";
import type { DetectedEvent, GroundStopEvent, NationwideEvent } from "./change-detector";

/** Thrown when `explain` receives an event whose type has no registered template. */
export class UnsupportedEventTypeError extends Error {
  readonly eventType: string;
  constructor(eventType: string) {
    super(`Unsupported event type: ${eventType}`);
    this.name = "UnsupportedEventTypeError";
    this.eventType = eventType;
  }
}

/** FAA reason (lower-cased, trimmed, exact match) to plain-language cause. */
const REASON_DICTIONARY: ReadonlyMap<string, string> = new Map([
  ["wind", "strong winds"],
  ["weather", "bad weather"],
  ["thunderstorms", "thunderstorms in the area"],
  ["low ceilings", "clouds hanging too low for safe landings"],
  ["low visibility", "poor visibility"],
  ["fog", "fog"],
  ["snow", "snow"],
  ["ice", "ice on the runways or aircraft"],
  ["airport volume", "more flights than the airport can handle at once"],
  ["volume", "more flights than the airport can handle at once"],
  ["runway construction", "construction work on a runway"],
  ["equipment outage", "an equipment failure"],
]);

const NO_REASON_SENTENCE = "The FAA has not given a reason AeroBrief can explain.";

/** The Cause sentence. Untranslated reason text is never shown. */
function cause(reason: string | null): string {
  if (reason === null) return NO_REASON_SENTENCE;
  const translation = REASON_DICTIONARY.get(reason.trim().toLowerCase());
  return translation === undefined
    ? NO_REASON_SENTENCE
    : `The FAA says the cause is ${translation}.`;
}

function airportLabel(e: GroundStopEvent): string {
  const a = airportById(e.airportId);
  return `${a.name} (${a.id})`;
}

export const MAX_LISTED_CENTERS = 6;

function started(e: GroundStopEvent): string {
  return `A ground stop is in effect at ${airportLabel(e)}. Flights bound for this airport are being held at their departure airports. ${cause(e.reason)}`;
}

function ended(e: GroundStopEvent): string {
  return `The ground stop at ${airportLabel(e)} has ended. Flights can depart for this airport again, although delays may continue for a while. ${cause(e.reason)}`;
}

function nationwide(e: NationwideEvent): string {
  const listed = e.affectedArtccs
    .slice(0, MAX_LISTED_CENTERS)
    .map((c) => `${artccName(c)} (${c})`)
    .join(", ");
  const more = e.affectedArtccs.length - MAX_LISTED_CENTERS;
  const tail = more > 0 ? `, and ${more} more.` : ".";
  return `Ground stops are active at airports served by ${e.count} of the FAA's regional air traffic control centers, which points to widespread disruption. Affected centers include ${listed}${tail}`;
}

/** One template per event type. A missing type is a compile error. */
const EXPLAINERS: {
  [K in DetectedEvent["type"]]: (e: Extract<DetectedEvent, { type: K }>) => string;
} = {
  GROUND_STOP_STARTED: started,
  GROUND_STOP_ENDED: ended,
  NATIONWIDE_EVENT: nationwide,
};

/** Plain-language explanation of a detected event (1 to 500 characters). Pure. */
export function explain(e: DetectedEvent): string {
  const type: string = e.type;
  if (!Object.hasOwn(EXPLAINERS, type)) throw new UnsupportedEventTypeError(type);
  const fn = EXPLAINERS[e.type] as (event: DetectedEvent) => string;
  return fn(e);
}
