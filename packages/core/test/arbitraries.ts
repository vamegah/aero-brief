import fc from "fast-check";
import { MONITORED_IDS, isMonitoredId, type MonitoredId } from "../src/airports";
import type { AirportStatus, FaaGroundStop, FaaResponse, GroundStopInfo, IdSource, Snapshot } from "../src/schemas";

/**
 * Shared fast-check arbitraries for packages/core property tests.
 * Used by tasks 2.8+, 5.x and 6.x. Test-only; never imported from src.
 */

// ---------- primitives ----------

const FROM = new Date("2026-01-01T00:00:00.000Z");
const TO = new Date("2027-01-01T00:00:00.000Z");

/** One of the 20 monitored airport ids. */
export const airportIdArb: fc.Arbitrary<MonitoredId> = fc.constantFrom(...MONITORED_IDS);

/** A valid UTC ISO-8601 timestamp (`toISOString()` form). */
export const isoTimestampArb: fc.Arbitrary<string> = fc
  .date({ min: FROM, max: TO, noInvalidDate: true })
  .map((d) => d.toISOString());

/** Short lowercase alphanumeric token, 1 to 8 chars. */
export const tokenArb: fc.Arbitrary<string> = fc.stringMatching(/^[a-z0-9]{1,8}$/);

/** Generic string: any unicode, including empty and whitespace-only. */
export const genericStringArb: fc.Arbitrary<string> = fc.oneof(
  fc.string({ maxLength: 40 }),
  fc.string({ unit: "grapheme", maxLength: 20 }),
  fc.constantFrom("", " ", "   ", "\t", "\n"),
);

/** A string that is not a monitored airport id (used for foreign airports). */
export const foreignAirportIdArb: fc.Arbitrary<string> = fc
  .oneof(fc.stringMatching(/^[A-Z]{3,4}$/), genericStringArb.filter((s) => s.length > 0))
  .filter((s) => !isMonitoredId(s));

// ---------- ground stop id / start time ----------

/** Non-blank string id. */
export const groundStopStringIdArb: fc.Arbitrary<string> = fc.oneof(
  tokenArb,
  fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim() !== ""),
);

/** Numeric id (FAA sometimes sends numbers). */
export const groundStopNumberIdArb: fc.Arbitrary<number> = fc.nat(1_000_000);

/** Blank / absent id: null, undefined, empty or whitespace-only string. */
export const blankIdArb: fc.Arbitrary<string | null | undefined> = fc.constantFrom<string | null | undefined>(
  null,
  undefined,
  "",
  "   ",
  "\t",
);

/** Any id form: string, number or blank. */
export const anyGroundStopIdArb: fc.Arbitrary<string | number | null | undefined> = fc.oneof(
  groundStopStringIdArb,
  groundStopNumberIdArb,
  blankIdArb,
);

/** Start time that does not parse as a date. */
export const unparseableStartTimeArb: fc.Arbitrary<string> = fc.constantFrom(
  "not a date",
  "",
  "yesterday-ish",
  "2026-13-45",
  "   ",
);

/** Valid, unparseable, or absent start time. */
export const anyStartTimeArb: fc.Arbitrary<string | null | undefined> = fc.oneof(
  isoTimestampArb,
  unparseableStartTimeArb,
  fc.constantFrom<null | undefined>(null, undefined),
);

/** Ground stop with a string id. */
export const groundStopWithStringIdArb: fc.Arbitrary<FaaGroundStop> = fc.record({
  id: groundStopStringIdArb,
  startTime: fc.option(anyStartTimeArb, { nil: null }),
});

/** Ground stop with a numeric id. */
export const groundStopWithNumberIdArb: fc.Arbitrary<FaaGroundStop> = fc.record({
  id: groundStopNumberIdArb,
  startTime: fc.option(anyStartTimeArb, { nil: null }),
});

/** Ground stop with a blank id (null, undefined, empty, whitespace). */
export const groundStopWithBlankIdArb: fc.Arbitrary<FaaGroundStop> = fc.record({
  id: blankIdArb,
  startTime: fc.option(anyStartTimeArb, { nil: null }),
});

/** Ground stop with no id and a valid start time. */
export const groundStopNoIdValidStartArb: fc.Arbitrary<FaaGroundStop> = fc.record({
  id: blankIdArb,
  startTime: isoTimestampArb,
});

/** Ground stop with no id and an unparseable start time. */
export const groundStopNoIdUnparseableStartArb: fc.Arbitrary<FaaGroundStop> = fc.record({
  id: blankIdArb,
  startTime: unparseableStartTimeArb,
});

/** Ground stop with no id and no start time at all. */
export const groundStopNoIdNoStartArb: fc.Arbitrary<FaaGroundStop> = fc.record({
  id: blankIdArb,
  startTime: fc.constantFrom<null | undefined>(null, undefined),
});

/** Any ground stop shape the FAA may send, with optional nullish extras. */
export const faaGroundStopArb: fc.Arbitrary<FaaGroundStop> = fc.oneof(
  groundStopWithStringIdArb,
  groundStopWithNumberIdArb,
  groundStopWithBlankIdArb,
  groundStopNoIdValidStartArb,
  groundStopNoIdUnparseableStartArb,
  groundStopNoIdNoStartArb,
);

// ---------- FAA response ----------

const nullishStringArb = fc.option(genericStringArb, { nil: null });

/** Unknown extra keys the FAA might add; the schema must strip them. */
const extraKeysArb: fc.Arbitrary<Record<string, unknown>> = fc.dictionary(
  fc.stringMatching(/^x_[a-z]{1,6}$/),
  fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null)),
  { maxKeys: 3 },
);

const faaGroundStopFullArb: fc.Arbitrary<FaaGroundStop> = fc
  .tuple(
    faaGroundStopArb,
    nullishStringArb,
    nullishStringArb,
    fc.option(isoTimestampArb, { nil: null }),
    fc.option(isoTimestampArb, { nil: undefined }),
    extraKeysArb,
  )
  .map(
    ([gs, impactingCondition, center, endTime, programExpirationTime, extra]) =>
      ({ ...extra, ...gs, impactingCondition, center, endTime, programExpirationTime }) as FaaGroundStop,
  );

/**
 * One FAA array entry. airportId is monitored or foreign; groundStop is an
 * object, null or absent; unknown extra keys may appear on the entry.
 */
export const faaAirportEventArb: fc.Arbitrary<FaaResponse[number]> = fc
  .tuple(
    fc.oneof({ weight: 3, arbitrary: airportIdArb as fc.Arbitrary<string> }, { weight: 1, arbitrary: foreignAirportIdArb }),
    fc.oneof(
      { weight: 3, arbitrary: faaGroundStopFullArb as fc.Arbitrary<FaaGroundStop | null | undefined> },
      { weight: 1, arbitrary: fc.constant<null | undefined>(null) },
      { weight: 1, arbitrary: fc.constant<null | undefined>(undefined) },
    ),
    nullishStringArb,
    extraKeysArb,
  )
  .map(([airportId, groundStop, airportLongName, extra]) => {
    const entry: Record<string, unknown> = { ...extra, airportId, airportLongName };
    if (groundStop !== undefined) entry["groundStop"] = groundStop;
    return entry as FaaResponse[number];
  });

/**
 * A schema-valid FAA response: monitored and foreign ids, duplicates of the
 * same airport (drawn from a small pool so they are frequent), nulls and
 * unknown extra keys. May be empty.
 */
export const faaResponseArb: fc.Arbitrary<FaaResponse> = fc.oneof(
  fc.array(faaAirportEventArb, { maxLength: 40 }),
  // Duplicate-heavy variant: reuse a few airport ids across many entries.
  fc
    .tuple(fc.subarray([...MONITORED_IDS], { minLength: 1, maxLength: 3 }), fc.array(faaAirportEventArb, { maxLength: 15 }))
    .map(([pool, entries]) =>
      entries.map((e, i) => ({ ...e, airportId: pool[i % pool.length] ?? e.airportId }) as FaaResponse[number]),
    ),
);

// ---------- Snapshots ----------

/** Build a ground stop info with a deterministic id from a slot number. */
function makeGroundStop(airportId: MonitoredId, slot: number, idSource: IdSource): GroundStopInfo {
  return {
    faaEventId: idSource === "faa_id" ? `faa:${airportId}-${slot}` : `${idSource}:${airportId}-${slot}`,
    idSource,
    reason: slot % 2 === 0 ? "wind" : null,
    center: slot % 3 === 0 ? "ZNY" : null,
    endTime: null,
    expectedEnd: slot % 4 === 0 ? "2026-01-01T12:00:00.000Z" : null,
    advisoryUrl: slot % 5 === 0 ? "https://www.fly.faa.gov/adv/adv_otherdis?advn=1" : null,
  };
}

const slotArb = fc.option(fc.nat(50), { nil: null });
const idSourceArb: fc.Arbitrary<IdSource> = fc.constantFrom("faa_id", "start_time", "first_seen");

function buildAirports(
  ids: readonly MonitoredId[],
  slots: readonly (number | null)[],
  sources: readonly IdSource[],
): AirportStatus[] {
  return ids.map((airportId, i) => {
    const slot = slots[i] ?? null;
    return {
      airportId,
      groundStop: slot === null ? null : makeGroundStop(airportId, slot, sources[i] ?? "faa_id"),
    };
  });
}

/** Sorted copy of the monitored ids (Snapshots are sorted by airportId). */
const SORTED_IDS: readonly MonitoredId[] = [...MONITORED_IDS].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

const n = SORTED_IDS.length;
const slotsFullArb = fc.array(slotArb, { minLength: n, maxLength: n });
const sourcesFullArb = fc.array(idSourceArb, { minLength: n, maxLength: n });

/** Snapshot over all 20 monitored ids, sorted, each airport with or without a ground stop. */
export const snapshotArb: fc.Arbitrary<Snapshot> = fc
  .tuple(slotsFullArb, sourcesFullArb, isoTimestampArb, fc.uuid())
  .map(([slots, sources, capturedAt, id]) => ({
    id,
    capturedAt,
    airports: buildAirports(SORTED_IDS, slots, sources),
  }));

/**
 * Snapshot variant listing only a subset (possibly empty) of the 20 airports.
 * Not schema-valid (SnapshotSchema requires 20); use to test tolerance of
 * missing airports in detectors and lookups.
 */
export const partialSnapshotArb: fc.Arbitrary<Snapshot> = fc
  .tuple(fc.subarray([...SORTED_IDS]), fc.array(slotArb, { minLength: n, maxLength: n }), sourcesFullArb, isoTimestampArb, fc.uuid())
  .map(([ids, slots, sources, capturedAt, id]) => ({
    id,
    capturedAt,
    airports: buildAirports(ids, slots, sources),
  }));

/**
 * Sequence of consecutive Snapshots with strictly increasing capturedAt
 * (one minute apart). Ground stops persist between snapshots with decent
 * probability so STARTED/ENDED transitions and continuations both occur.
 */
export function snapshotSequenceArb(
  bounds: { minLength?: number; maxLength?: number } = {},
): fc.Arbitrary<Snapshot[]> {
  const { minLength = 1, maxLength = 8 } = bounds;
  return fc
    .tuple(
      fc.array(fc.tuple(slotsFullArb, sourcesFullArb, fc.uuid()), { minLength, maxLength }),
      fc.date({ min: FROM, max: new Date("2026-06-01T00:00:00.000Z"), noInvalidDate: true }),
    )
    .map(([steps, start]) =>
      steps.map(([slots, sources, id], i): Snapshot => ({
        id,
        capturedAt: new Date(start.getTime() + i * 60_000).toISOString(),
        airports: buildAirports(SORTED_IDS, slots, sources),
      })),
    );
}
