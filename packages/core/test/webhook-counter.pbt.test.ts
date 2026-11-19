// Feature: aerobrief-phase2, Property 18: Failure counter and auto-disable
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  applyOutcome,
  WEBHOOK_FAILURE_THRESHOLD,
  type WebhookCounterState,
  type WebhookOutcomeEvent,
} from "../src/webhooks/counter";

const eventArb = fc.constantFrom<WebhookOutcomeEvent>("delivered", "failed", "skipped", "reenabled");
// Bias toward failures so that runs of 5 occur often.
const eventsArb = fc.array(
  fc.oneof(
    { weight: 6, arbitrary: fc.constant<WebhookOutcomeEvent>("failed") },
    { weight: 4, arbitrary: eventArb },
  ),
  { maxLength: 40 },
);

const START: WebhookCounterState = { failures: 0, disabled: false };

/** Reference model: counts consecutive failures since the last reset. */
function reference(events: readonly WebhookOutcomeEvent[]): WebhookCounterState {
  let run = 0;
  let disabled = false;
  for (const e of events) {
    if (e === "reenabled") {
      run = 0;
      disabled = false;
    } else if (disabled || e === "skipped") {
      continue;
    } else if (e === "delivered") {
      run = 0;
    } else {
      run += 1;
      if (run === 5) disabled = true;
    }
  }
  return { failures: run, disabled };
}

const fold = (events: readonly WebhookOutcomeEvent[]): WebhookCounterState =>
  events.reduce(applyOutcome, START);

describe("Property 18: failure counter and auto-disable", () => {
  it("threshold is 5", () => {
    expect(WEBHOOK_FAILURE_THRESHOLD).toBe(5);
  });

  it("matches the reference model after every prefix", () => {
    // **Validates: Requirements 16.9, 16.10, 16.11, 16.16, 16.18, 16.19**
    fc.assert(
      fc.property(eventsArb, (events) => {
        let state = START;
        events.forEach((e, i) => {
          state = applyOutcome(state, e);
          expect(state).toEqual(reference(events.slice(0, i + 1)));
        });
      }),
      { numRuns: 200 },
    );
  });

  it("is disabled iff 5 consecutive failures occurred since the last reset while enabled", () => {
    // **Validates: Requirements 16.10, 16.11, 16.16**
    fc.assert(
      fc.property(eventsArb, (events) => {
        let run = 0;
        let latched = false;
        for (const e of events) {
          if (e === "reenabled") {
            run = 0;
            latched = false;
          } else if (e === "delivered" && !latched) {
            run = 0;
          } else if (e === "failed" && !latched) {
            run += 1;
            if (run >= 5) latched = true;
          }
        }
        expect(fold(events).disabled).toBe(latched);
      }),
      { numRuns: 200 },
    );
  });

  it("failures never exceed 5 and are 5 only when disabled", () => {
    // **Validates: Requirements 16.9, 16.10**
    fc.assert(
      fc.property(eventsArb, (events) => {
        let state = START;
        for (const e of events) {
          state = applyOutcome(state, e);
          expect(state.failures).toBeLessThanOrEqual(5);
          expect(state.failures >= 5).toBe(state.disabled);
        }
      }),
      { numRuns: 200 },
    );
  });

  it("a disabled webhook ignores everything except reenabled", () => {
    // **Validates: Requirements 16.16, 16.18**
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom<WebhookOutcomeEvent>("delivered", "failed", "skipped"), { maxLength: 20 }),
        (events) => {
          const disabled = fold(["failed", "failed", "failed", "failed", "failed"]);
          expect(disabled).toEqual({ failures: 5, disabled: true });
          expect(events.reduce(applyOutcome, disabled)).toEqual(disabled);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("reenabled applied twice equals applied once", () => {
    // **Validates: Requirements 16.19**
    fc.assert(
      fc.property(eventsArb, (events) => {
        const once = applyOutcome(fold(events), "reenabled");
        const twice = applyOutcome(once, "reenabled");
        expect(twice).toEqual(once);
        expect(once).toEqual(START);
      }),
      { numRuns: 100 },
    );
  });
});
