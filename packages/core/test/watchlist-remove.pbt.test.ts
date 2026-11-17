import { describe, expect, test } from "vitest";
import fc from "fast-check";
import { MONITORED_IDS, type MonitoredId } from "../src/airports";
import { applyWatchlistOp, WATCHLIST_CAP } from "../src/watchlist";

// A valid Watchlist: unique monitored ids, at most the cap.
const watchlistArb: fc.Arbitrary<readonly MonitoredId[]> = fc.uniqueArray(
  fc.constantFrom<MonitoredId>(...MONITORED_IDS),
  { maxLength: WATCHLIST_CAP },
);

// Any airport id: monitored (present or absent) or arbitrary strings.
const airportIdArb: fc.Arbitrary<string> = fc.oneof(
  fc.constantFrom<string>(...MONITORED_IDS),
  fc.string({ maxLength: 6 }),
);

function remove(list: readonly MonitoredId[], airportId: string): readonly MonitoredId[] {
  const result = applyWatchlistOp(list, { type: "remove", airportId });
  if (!result.ok) throw new Error("remove must never fail");
  return result.list;
}

describe("Feature: aerobrief, Property 22: Watchlist remove is idempotent", () => {
  /** **Validates: Requirements 8.3** */
  test("removing twice equals removing once", () => {
    fc.assert(
      fc.property(watchlistArb, airportIdArb, (list, id) => {
        const once = remove(list, id);
        const twice = remove(once, id);
        expect(twice).toEqual(once);
      }),
      { numRuns: 100 },
    );
  });

  /** **Validates: Requirements 8.3** */
  test("removing an absent airport returns the Watchlist unchanged", () => {
    fc.assert(
      fc.property(watchlistArb, airportIdArb, (list, id) => {
        fc.pre(!(list as readonly string[]).includes(id));
        expect(remove(list, id)).toEqual(list);
      }),
      { numRuns: 100 },
    );
  });

  /** **Validates: Requirements 8.3** */
  test("removing a present airport drops exactly that airport", () => {
    fc.assert(
      fc.property(watchlistArb.filter((l) => l.length > 0), fc.nat(), (list, n) => {
        const id = list[n % list.length] as MonitoredId;
        expect(remove(list, id)).toEqual(list.filter((x) => x !== id));
      }),
      { numRuns: 100 },
    );
  });
});
