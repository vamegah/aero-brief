import { describe, expect, test } from "vitest";
import fc from "fast-check";
import { isMonitoredId, MONITORED_IDS, type MonitoredId } from "../src/airports";
import { applyWatchlistOp, WATCHLIST_CAP, type WatchlistOp } from "../src/watchlist";

const monitoredIdArb: fc.Arbitrary<string> = fc.constantFrom<string>(...MONITORED_IDS);
const unmonitoredIdArb: fc.Arbitrary<string> = fc
  .oneof(
    fc.constantFrom("XXX", "atl", "KATL", "", " ", "ZZZ"),
    fc.stringMatching(/^[A-Za-z0-9]{0,5}$/),
  )
  .filter((s) => !isMonitoredId(s));

// Monitored ids dominate and adds outnumber removes so sequences reach the cap.
const opArb: fc.Arbitrary<WatchlistOp> = fc.record({
  type: fc.constantFrom<WatchlistOp["type"]>("add", "add", "add", "remove"),
  airportId: fc.oneof(
    { arbitrary: monitoredIdArb, weight: 4 },
    { arbitrary: unmonitoredIdArb, weight: 1 },
  ),
});

const opsArb = fc.array(opArb, { minLength: 0, maxLength: 80 });

describe("Feature: aerobrief, Property 21: Watchlist invariants over operation sequences", () => {
  /** **Validates: Requirements 8.1, 8.2, 8.4, 8.5, 8.8** */
  test("size, uniqueness, rejection and add/remove postconditions hold after every step", () => {
    fc.assert(
      fc.property(opsArb, (ops) => {
        let list: readonly MonitoredId[] = [];
        for (const op of ops) {
          const before: readonly MonitoredId[] = [...list];
          const result = applyWatchlistOp(list, op);

          // Input is never mutated.
          expect(list).toEqual(before);

          if (!result.ok) {
            if (result.error === "unmonitored") {
              expect(op.type).toBe("add");
              expect(isMonitoredId(op.airportId)).toBe(false);
            } else {
              expect(op.type).toBe("add");
              expect(before.length).toBe(WATCHLIST_CAP);
              expect(before.includes(op.airportId as MonitoredId)).toBe(false);
            }
            // A rejected operation leaves the Watchlist unchanged.
            list = before;
            continue;
          }

          list = result.list;
          expect(list.length).toBeGreaterThanOrEqual(0);
          expect(list.length).toBeLessThanOrEqual(WATCHLIST_CAP);
          expect(new Set(list).size).toBe(list.length);
          for (const id of list) expect(isMonitoredId(id)).toBe(true);

          if (op.type === "add") {
            expect(list.includes(op.airportId as MonitoredId)).toBe(true);
          } else {
            expect(list.includes(op.airportId as MonitoredId)).toBe(false);
          }
        }
      }),
      { numRuns: 200 },
    );
  });

  // Feature: core30-limits, Property 1: Watchlist cap invariant
  /** **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 8.3** */
  test("from a full list, mixed ops keep at most the cap and refuse only new monitored ids", () => {
    fc.assert(
      fc.property(fc.shuffledSubarray([...MONITORED_IDS], { minLength: WATCHLIST_CAP }), opsArb, (fill, ops) => {
        let list: readonly MonitoredId[] = [];
        const all = [
          ...fill.map((airportId): WatchlistOp => ({ type: "add", airportId })),
          ...ops,
        ];
        for (const op of all) {
          const before: readonly MonitoredId[] = [...list];
          const result = applyWatchlistOp(list, op);
          const monitored = isMonitoredId(op.airportId);
          const present = before.includes(op.airportId as MonitoredId);

          const mustRefuseCap = op.type === "add" && monitored && !present && before.length >= WATCHLIST_CAP;
          if (mustRefuseCap) {
            expect(result).toEqual({ ok: false, error: "cap_exceeded" });
          } else if (op.type === "add" && !monitored) {
            expect(result).toEqual({ ok: false, error: "unmonitored" });
          } else {
            expect(result.ok).toBe(true);
          }
          if (op.type === "add" && present && result.ok) expect(result.list).toEqual(before);

          if (result.ok) list = result.list;
          expect(list.length).toBeLessThanOrEqual(WATCHLIST_CAP);
          expect(new Set(list).size).toBe(list.length);
          for (const id of list) expect(isMonitoredId(id)).toBe(true);
        }
        expect(WATCHLIST_CAP).toBe(30);
      }),
      { numRuns: 200 },
    );
  });

  /** **Validates: Requirements 8.2, 8.4** */
  test("adds of monitored ids beyond the cap are rejected and the list stays at the cap", () => {
    fc.assert(
      fc.property(fc.shuffledSubarray([...MONITORED_IDS], { minLength: WATCHLIST_CAP }), (ids) => {
        let list: readonly MonitoredId[] = [];
        for (const id of ids) {
          const result = applyWatchlistOp(list, { type: "add", airportId: id });
          if (list.length < WATCHLIST_CAP) {
            expect(result.ok).toBe(true);
            if (result.ok) list = result.list;
          } else {
            expect(result).toEqual({ ok: false, error: "cap_exceeded" });
          }
        }
        expect(list.length).toBe(WATCHLIST_CAP);
      }),
      { numRuns: 100 },
    );
  });
});
