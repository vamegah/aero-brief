import { airportById, artccName } from "./airports";
import type { DetectedEvent, GroundStopEvent, NationwideEvent } from "./change-detector";
import { formatDurationText } from "./format-duration";
import type { Incident } from "./incidents";
import { normalizationEstimate } from "./status-derivation";

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

// ---- Structured explanation (Requirement 3) ----

export const REASON_NOT_PUBLISHED = "Reason not published by the FAA";
export const NOT_YET_ANNOUNCED = "Not yet announced";
export const NOT_AVAILABLE = "Not available";
const REASON_NOT_EXPLAINABLE = "The FAA gave a reason that AeroBrief cannot explain yet";
export const STRUCTURED_SOURCE = "FAA National Airspace System Status";

/** The five labeled fields, in display order. */
export const STRUCTURED_FIELD_LABELS = {
  whatsHappening: "What's happening",
  why: "Why",
  likelyImpact: "Likely impact",
  nextUpdate: "Next update",
  source: "Source",
} as const;

export interface StructuredExplanation {
  whatsHappening: string;
  why: string;
  likelyImpact: string;
  nextUpdate: string;
  source: string;
}

function validMs(iso: string | null): number | null {
  if (iso === null) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

/** "2024-06-01 12:00 UTC", minute precision, no locale dependence. */
function utcMinute(ms: number): string {
  return `${new Date(ms).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function structuredWhy(reason: string | null): string {
  if (reason === null || reason.trim() === "") return REASON_NOT_PUBLISHED;
  const translation = REASON_DICTIONARY.get(reason.trim().toLowerCase());
  if (translation === undefined) return REASON_NOT_EXPLAINABLE;
  return `The FAA says the cause is ${translation}`;
}

function estimateText(durationMs: number, basis: string): string {
  const [low, high] = normalizationEstimate(durationMs);
  return `AeroBrief estimate: delays may last about ${formatDurationText(low * 60_000)} to ${formatDurationText(high * 60_000)} after the ground stop ends, based on ${basis}.`;
}

/**
 * Plain-language explanation of an Incident as five labeled fields, none empty.
 * `reason` is the FAA reason text (null when none was published). `expectedEnd` is an
 * ISO time when the FAA announced an expected end or next update, otherwise null.
 * `now` is a parameter because Core never reads the clock. Throws
 * UnsupportedEventTypeError for an incident type with no template.
 */
export function explainStructured(
  incident: Incident,
  reason: string | null,
  expectedEnd: string | null,
  now: Date,
): StructuredExplanation {
  const type: string = incident.type;
  if (type !== "GROUND_STOP_STARTED" && type !== "NATIONWIDE_EVENT") {
    throw new UnsupportedEventTypeError(type);
  }
  const source = STRUCTURED_SOURCE;

  if (incident.type === "NATIONWIDE_EVENT") {
    const endMs = validMs(expectedEnd);
    return {
      whatsHappening:
        "Ground stops are active at airports in several regions at once, which points to widespread disruption.",
      why: structuredWhy(reason),
      likelyImpact:
        "Flights across many parts of the country may be held or delayed. AeroBrief has no estimate for how long this will last.",
      nextUpdate: endMs === null ? NOT_YET_ANNOUNCED : `Expected around ${utcMinute(endMs)}`,
      source,
    };
  }

  const airport = incident.airportId === null ? "an airport" : (() => {
    const a = airportById(incident.airportId);
    return `${a.name} (${a.id})`;
  })();
  const why = structuredWhy(reason);

  if (incident.endedAt !== null) {
    const endedMs = validMs(incident.endedAt);
    const duration = incident.durationMs ?? 0;
    const minutes = Math.round(Math.max(0, duration) / 60_000);
    return {
      whatsHappening: `The ground stop at ${airport} has ended. Flights can depart for this airport again.`,
      why,
      likelyImpact: estimateText(duration, `a ground stop that lasted about ${minutes} minutes`),
      nextUpdate:
        endedMs === null
          ? "No further update expected. The ground stop has ended."
          : `No further update expected. The ground stop ended at ${utcMinute(endedMs)}.`,
      source,
    };
  }

  const startMs = validMs(incident.startedAt);
  const elapsed = startMs === null ? null : Math.max(0, now.getTime() - startMs);
  const endMs = validMs(expectedEnd);
  return {
    whatsHappening: `A ground stop is in effect at ${airport}. Flights bound for this airport are being held at their departure airports.`,
    why,
    likelyImpact:
      elapsed === null
        ? NOT_AVAILABLE
        : estimateText(
            elapsed,
            `how long the ground stop has lasted so far (about ${Math.round(elapsed / 60_000)} minutes)`,
          ),
    nextUpdate: endMs === null ? NOT_YET_ANNOUNCED : `Expected to end around ${utcMinute(endMs)}`,
    source,
  };
}