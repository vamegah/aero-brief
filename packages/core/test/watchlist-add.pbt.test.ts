import { describe, expect, test } from "vitest";
import fc from "fast-check";
import { MONITORED_IDS, type MonitoredId } from "../src/airports";
import { applyWatchlistOp, WATCHLIST_CAP, type WatchlistResult } from "../src/watchlist";

const monitoredIdArb: fc.Arbitrary<MonitoredId> = fc.constantFrom<MonitoredId>(...MONITORED_IDS);

// Any valid Watchlist: unique monitored ids, 0..10 long.
const listArb: fc.Arbitrary<readonly MonitoredId[]> = fc.uniqueArray(monitoredIdArb, {
  minLength: 0,
  maxLength: WATCHLIST_CAP,
});

const fullListArb: fc.Arbitrary<readonly MonitoredId[]> = fc.uniqueArray(monitoredIdArb, {
  minLength: WATCHLIST_CAP,
  maxLength: WATCHLIST_CAP,
});

describe("Feature: aerobrief, Property 23: Watchlist add is idempotent", () => {
  /** **Validates: Requirements 8.6** */
  test("adding an accepted airport twice equals adding it once", () => {
    fc.assert(
      fc.property(listArb, monitoredIdArb, (list, airportId) => {
        const once: WatchlistResult = applyWatchlistOp(list, { type: "add", airportId });
        if (!once.ok) {
          // Rejected adds (full list, new id) are not covered by this property.
          expect(once.error).toBe("cap_exceeded");
          return;
        }
        const twice = applyWatchlistOp(once.list, { type: "add", airportId });
        expect(twice).toEqual(once);
      }),
      { numRuns: 100 },
    );
  });

  /** **Validates: Requirements 8.6** */
  test("adding a present airport to a full Watchlist succeeds and leaves it unchanged", () => {
    fc.assert(
      fc.property(
        fullListArb.chain((list) =>
          fc.record({ list: fc.constant(list), airportId: fc.constantFrom<MonitoredId>(...list) }),
        ),
        ({ list, airportId }) => {
          const before: readonly MonitoredId[] = [...list];
          const result = applyWatchlistOp(list, { type: "add", airportId });
          expect(result).toEqual({ ok: true, list: before });
          expect(list).toEqual(before);
        },
      ),
      { numRuns: 100 },
    );
  });
});
