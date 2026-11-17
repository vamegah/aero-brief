import fc from "fast-check";
import { describe, it } from "vitest";
import { DISPLAY_WINDOW_MS, selectDisplayEvents } from "../src/lib/display-window";

interface TestEvent {
  id: number;
  occurredAt: string;
}

const MIN_DATE = Date.UTC(2000, 0, 1);
const MAX_DATE = Date.UTC(2100, 0, 1);

const nowArb: fc.Arbitrary<Date> = fc
  .integer({ min: MIN_DATE, max: MAX_DATE })
  .map((ms) => new Date(ms));

/** Ages in ms, spanning well inside, around the 24 h boundary, and beyond it. */
const ageArb: fc.Arbitrary<number> = fc.oneof(
  fc.integer({ min: 0, max: 3 * DISPLAY_WINDOW_MS }),
  fc.integer({ min: DISPLAY_WINDOW_MS - 5, max: DISPLAY_WINDOW_MS + 5 }),
);

describe("Property 28: Display window selection", () => {
  // Feature: aerobrief, Property 28: Display window selection
  // **Validates: Requirements 10.3, 10.4**
  it("keeps exactly the Events aged 24 h or less, newest first", () => {
    fc.assert(
      fc.property(nowArb, fc.array(ageArb, { maxLength: 40 }), (now, ages) => {
        const events: TestEvent[] = ages.map((age, id) => ({
          id,
          occurredAt: new Date(now.getTime() - age).toISOString(),
        }));

        const result = selectDisplayEvents(events, now);

        const expectedIds = events
          .filter((e) => now.getTime() - Date.parse(e.occurredAt) <= DISPLAY_WINDOW_MS)
          .map((e) => e.id)
          .sort((a, b) => a - b);
        const actualIds = result.map((e) => e.id).sort((a, b) => a - b);
        if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) {
          throw new Error(`ids mismatch: expected ${expectedIds.join(",")} got ${actualIds.join(",")}`);
        }

        for (let i = 1; i < result.length; i += 1) {
          const prev = result[i - 1];
          const curr = result[i];
          if (prev === undefined || curr === undefined) throw new Error("unexpected hole");
          if (Date.parse(prev.occurredAt) < Date.parse(curr.occurredAt)) {
            throw new Error(`not newest first at index ${i}`);
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});
