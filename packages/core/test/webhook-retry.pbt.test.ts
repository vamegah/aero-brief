// Feature: aerobrief-phase2, Property 17: Retry bound
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  type AttemptResult,
  classifyAttempt,
  MAX_ATTEMPTS,
  nextStep,
  type DeliveryOutcome,
} from "../src/webhooks/retry";

const NUM_RUNS = 200;

const resultArb: fc.Arbitrary<AttemptResult> = fc.oneof(
  fc.integer({ min: 100, max: 599 }).map((status) => ({ status })),
  fc.integer({ min: -1000, max: 1000 }).map((status) => ({ status })),
  fc.constantFrom("timeout", "network", "blocked_url", "invalid_payload" as const).map(
    (errorKind) => ({ errorKind }) as AttemptResult,
  ),
);
const sequenceArb = fc.array(resultArb, { minLength: 3, maxLength: 6 });

function simulate(results: AttemptResult[]) {
  const waits: number[] = [];
  let attempts = 0;
  let outcome: DeliveryOutcome | undefined;
  for (const result of results) {
    attempts += 1;
    const step = nextStep(attempts, classifyAttempt(result));
    if (step.done) {
      outcome = step.outcome;
      break;
    }
    waits.push(step.waitMs);
  }
  return { attempts, waits, outcome };
}

describe("Property 17: Retry bound", () => {
  it("makes at most 3 attempts, always finishes, and waits are a prefix of [2000, 8000]", () => {
    // **Validates: Requirements 16.4, 16.5, 16.6, 16.15**
    fc.assert(
      fc.property(sequenceArb, (results) => {
        const { attempts, waits, outcome } = simulate(results);
        expect(outcome).toBeDefined();
        expect(attempts).toBeLessThanOrEqual(MAX_ATTEMPTS);
        expect(waits).toEqual([2000, 8000].slice(0, waits.length));
        expect(waits.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(10000);
        expect(waits.length).toBe(attempts - 1);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("stops at the first 2xx as delivered and at the first permanent result as failed", () => {
    // **Validates: Requirements 16.4, 16.5, 16.6, 16.15**
    fc.assert(
      fc.property(sequenceArb, (results) => {
        const { attempts, outcome } = simulate(results);
        const last = results[attempts - 1];
        if (last === undefined) throw new Error(`no result at index ${attempts - 1}`);
        const cls = classifyAttempt(last);
        // every earlier attempt was retryable
        for (let i = 0; i < attempts - 1; i++) {
          const earlier = results[i];
          if (earlier === undefined) throw new Error(`no result at index ${i}`);
          expect(classifyAttempt(earlier)).toBe("retryable");
        }
        if (cls === "delivered") expect(outcome).toBe("delivered");
        else if (cls === "permanent") expect(outcome).toBe("failed");
        else {
          expect(attempts).toBe(MAX_ATTEMPTS);
          expect(outcome).toBe("failed");
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("never retries 3xx, other 4xx, 1xx, or blocked_url / invalid_payload", () => {
    // **Validates: Requirements 16.4, 16.5, 16.6, 16.15**
    const neverRetried: fc.Arbitrary<AttemptResult> = fc.oneof(
      fc.integer({ min: 100, max: 199 }).map((status) => ({ status })),
      fc.integer({ min: 300, max: 399 }).map((status) => ({ status })),
      fc
        .integer({ min: 400, max: 499 })
        .filter((s) => s !== 408 && s !== 429)
        .map((status) => ({ status })),
      fc
        .constantFrom("blocked_url", "invalid_payload" as const)
        .map((errorKind) => ({ errorKind }) as AttemptResult),
    );
    fc.assert(
      fc.property(neverRetried, (result) => {
        expect(classifyAttempt(result)).toBe("permanent");
        expect(nextStep(1, "permanent")).toEqual({ done: true, outcome: "failed" });
        const { attempts, waits, outcome } = simulate([result, { status: 200 }, { status: 200 }]);
        expect(attempts).toBe(1);
        expect(waits).toEqual([]);
        expect(outcome).toBe("failed");
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
