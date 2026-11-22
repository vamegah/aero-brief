import fc from "fast-check";
import { describe, it } from "vitest";
import { shouldWarnUpstreamFailure, type PreviousPollRun } from "../src/upstream-warning";

const STEP_MS = 300_000;
const HOUR_MS = 3_600_000;

/**
 * Feature: faa-403-poller, Property 3: Observability - Non-2xx is visible and rate-limited
 *
 * **Validates: Requirements 1.3, 2.3**
 */
describe("shouldWarnUpstreamFailure (property)", () => {
  it("warns on the first failure after a success or at the start, and at most once per UTC hour while failures persist", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 20_000 }).map((n) => 1_700_000_000_000 + n * STEP_MS),
        fc.array(fc.boolean(), { minLength: 1, maxLength: 120 }),
        (startMs, failures) => {
          let previous: PreviousPollRun | null = null;
          const warningsPerHour = new Map<number, number>();
          let failureRun = 0;

          failures.forEach((failed, i) => {
            const at = new Date(startMs + i * STEP_MS);
            if (failed) {
              const warn = shouldWarnUpstreamFailure(previous, at);
              const firstOfRun = failureRun === 0;
              if (firstOfRun && !warn) throw new Error(`no warning on first failure at step ${i}`);
              if (warn) {
                const hour = Math.floor(at.getTime() / HOUR_MS);
                warningsPerHour.set(hour, (warningsPerHour.get(hour) ?? 0) + 1);
              }
              failureRun += 1;
            } else {
              failureRun = 0;
            }
            previous = { outcome: failed ? "failed" : "success", startedAt: at };
          });

          // Within one failure run, no UTC hour may have more than one warning.
          // Recheck run by run so a success in between (which legitimately re-arms) is allowed.
          let prev: PreviousPollRun | null = null;
          let runHourWarned = new Set<number>();
          failures.forEach((failed, i) => {
            const at = new Date(startMs + i * STEP_MS);
            if (!failed) {
              runHourWarned = new Set();
            } else if (shouldWarnUpstreamFailure(prev, at)) {
              const hour = Math.floor(at.getTime() / HOUR_MS);
              if (runHourWarned.has(hour)) throw new Error(`second warning in hour ${hour} within one failure run`);
              runHourWarned.add(hour);
            }
            prev = { outcome: failed ? "failed" : "success", startedAt: at };
          });
        },
      ),
      { numRuns: 200 },
    );
  });
});
