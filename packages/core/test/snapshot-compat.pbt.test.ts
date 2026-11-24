import { describe, expect, test } from "vitest";
import fc from "fast-check";
import { MONITORED_IDS } from "../src/airports";
import { SnapshotSchema } from "../src/schemas";
import { completeSnapshotAirports } from "../src/snapshot-compat";

const SNAPSHOT_ID = "123e4567-e89b-42d3-a456-426614174000";
const CAPTURED_AT = "2026-11-24T12:00:00.000Z";

type Entry = { airportId: string; groundStop: unknown };

const groundStopArb = fc.option(
  fc.record({
    faaEventId: fc.string({ minLength: 1, maxLength: 12 }),
    idSource: fc.constantFrom("faa_id", "start_time", "first_seen"),
    reason: fc.option(fc.string({ maxLength: 20 }), { nil: null }),
    center: fc.option(fc.string({ maxLength: 6 }), { nil: null }),
    endTime: fc.option(fc.string({ maxLength: 20 }), { nil: null }),
    expectedEnd: fc.option(fc.string({ maxLength: 20 }), { nil: null }),
    advisoryUrl: fc.option(fc.string({ maxLength: 30 }), { nil: null }),
  }),
  { nil: null },
);

/** A subset of the registry in random order, each id once, with random ground stop values. */
const subsetArb: fc.Arbitrary<Entry[]> = fc
  .shuffledSubarray([...MONITORED_IDS])
  .chain((ids) =>
    fc.tuple(...ids.map((airportId) => groundStopArb.map((groundStop) => ({ airportId, groundStop })))),
  )
  .map((entries) => entries as Entry[]);

const strictSubsetArb = subsetArb.filter((s) => s.length < MONITORED_IDS.length);

const snapshotOf = (airports: unknown) => ({ id: SNAPSHOT_ID, capturedAt: CAPTURED_AT, airports });

const complete = (stored: Entry[]) => completeSnapshotAirports(stored) as Entry[];

describe("completeSnapshotAirports properties", () => {
  // Feature: core30-limits, Property 3: Completing a Legacy_Snapshot
  test("Property 3: Completing a Legacy_Snapshot", () => {
    /** **Validates: Requirements 4.1, 4.2, 8.7** */
    fc.assert(
      fc.property(subsetArb, (stored) => {
        const copy = structuredClone(stored);
        const out = complete(stored);

        expect(stored).toEqual(copy); // pure
        expect(out).toHaveLength(MONITORED_IDS.length);
        const ids = out.map((e) => e.airportId);
        expect(new Set(ids).size).toBe(MONITORED_IDS.length);
        expect(ids).toEqual([...ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));

        const byId = new Map(out.map((e) => [e.airportId, e]));
        for (const entry of stored) expect(byId.get(entry.airportId)).toEqual(entry);

        const storedIds = new Set(stored.map((e) => e.airportId));
        for (const e of out) {
          if (!storedIds.has(e.airportId)) expect(e.groundStop).toBeNull();
        }

        expect(complete(out)).toEqual(out); // idempotent
      }),
      { numRuns: 100 },
    );
  });
});

describe("SnapshotSchema registry properties", () => {
  // Feature: core30-limits, Property 4: Schema accepts exactly the full registry
  test("Property 4: Schema accepts exactly the full registry", () => {
    /** **Validates: Requirements 4.5, 4.6** */
    const messyListArb = fc
      .tuple(
        fc.shuffledSubarray([...MONITORED_IDS]),
        fc.array(fc.constantFrom(...MONITORED_IDS, "XXX", "ZZZ", "kjfk"), { maxLength: 4 }),
      )
      .chain(([base, extra]) =>
        fc.shuffledSubarray([...base, ...extra], { minLength: 0 }).map((ids) =>
          ids.map((airportId) => ({ airportId, groundStop: null })),
        ),
      );
    // Mostly-full lists so both accepted and rejected cases occur.
    const nearFullArb = fc
      .tuple(fc.shuffledSubarray([...MONITORED_IDS], { minLength: MONITORED_IDS.length - 1 }), fc.boolean())
      .map(([ids, dup]) => {
        const list = ids.map((airportId) => ({ airportId, groundStop: null }));
        return dup && list.length > 0 ? [...list, list[0]!] : list;
      });

    fc.assert(
      fc.property(fc.oneof(messyListArb, nearFullArb), (airports) => {
        const ids = airports.map((a) => a.airportId);
        const expected =
          ids.length === MONITORED_IDS.length &&
          new Set(ids).size === MONITORED_IDS.length &&
          ids.every((id) => (MONITORED_IDS as readonly string[]).includes(id));
        expect(SnapshotSchema.safeParse(snapshotOf(airports)).success).toBe(expected);
      }),
      { numRuns: 200 },
    );

    fc.assert(
      fc.property(strictSubsetArb, (stored) => {
        expect(SnapshotSchema.safeParse(snapshotOf(stored)).success).toBe(false);
        expect(SnapshotSchema.safeParse(snapshotOf(complete(stored))).success).toBe(true);
      }),
      { numRuns: 100 },
    );

    fc.assert(
      fc.property(
        subsetArb,
        fc.constantFrom("XXX", "ZZZ", "kjfk", ""),
        (stored, unknownId) => {
          const out = completeSnapshotAirports([...stored, { airportId: unknownId, groundStop: null }]);
          expect(SnapshotSchema.safeParse(snapshotOf(out)).success).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});
