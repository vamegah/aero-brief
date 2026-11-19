// Feature: aerobrief-phase2, Property 21: Test event rate limit
// **Validates: Requirements 18.6, 18.9**
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { retryAfterSeconds, testEventAllowed } from "../src/webhooks/test-limit";

const BASE = Date.UTC(2030, 0, 1);
const offsetMs = fc.integer({ min: -3_600_000, max: 3_600_000 });
const dateArb = fc.integer({ min: 0, max: 10_000_000_000 }).map((n) => new Date(BASE + n));
const opts = { numRuns: 200 };

describe("Property 21: Test event rate limit", () => {
  it("a null lastTestAt is always allowed", () => {
    fc.assert(
      fc.property(dateArb, (now) => {
        expect(testEventAllowed(null, now)).toBe(true);
      }),
      opts,
    );
  });

  it("is allowed iff now - lastTestAt >= 60 s", () => {
    fc.assert(
      fc.property(dateArb, offsetMs, (last, delta) => {
        const now = new Date(last.getTime() + delta);
        expect(testEventAllowed(last, now)).toBe(delta >= 60_000);
      }),
      opts,
    );
  });

  it("retryAfterSeconds is always an integer in [1, 60]", () => {
    fc.assert(
      fc.property(fc.option(dateArb, { nil: null }), dateArb, (last, now) => {
        const r = retryAfterSeconds(last, now);
        expect(Number.isInteger(r)).toBe(true);
        expect(r).toBeGreaterThanOrEqual(1);
        expect(r).toBeLessThanOrEqual(60);
      }),
      opts,
    );
    fc.assert(
      fc.property(dateArb, offsetMs, (last, delta) => {
        const r = retryAfterSeconds(last, new Date(last.getTime() + delta));
        expect(r).toBeGreaterThanOrEqual(1);
        expect(r).toBeLessThanOrEqual(60);
      }),
      opts,
    );
  });

  it("when refused, waiting retryAfterSeconds makes it allowed", () => {
    fc.assert(
      fc.property(dateArb, fc.integer({ min: 0, max: 59_999 }), (last, delta) => {
        const now = new Date(last.getTime() + delta);
        expect(testEventAllowed(last, now)).toBe(false);
        const wait = retryAfterSeconds(last, now);
        expect(testEventAllowed(last, new Date(now.getTime() + wait * 1000))).toBe(true);
      }),
      opts,
    );
  });

  it("a future lastTestAt is never allowed", () => {
    fc.assert(
      fc.property(dateArb, fc.integer({ min: 1, max: 3_600_000 }), (now, ahead) => {
        expect(testEventAllowed(new Date(now.getTime() + ahead), now)).toBe(false);
      }),
      opts,
    );
  });

  it("accepted requests in any increasing sequence are at least 60 s apart, and refusals are exact", () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 200_000 }), { maxLength: 60 }), (gaps) => {
        let t = BASE;
        let lastAccepted: Date | null = null;
        const accepted: number[] = [];
        for (const g of gaps) {
          t += g;
          const now = new Date(t);
          const allowed = testEventAllowed(lastAccepted, now);
          const expected = lastAccepted === null || t - lastAccepted.getTime() >= 60_000;
          expect(allowed).toBe(expected);
          if (allowed) {
            accepted.push(t);
            lastAccepted = now;
          } else {
            const r = retryAfterSeconds(lastAccepted, now);
            expect(r).toBeGreaterThanOrEqual(1);
            expect(r).toBeLessThanOrEqual(60);
          }
        }
        for (let i = 1; i < accepted.length; i++) {
          expect(accepted[i]! - accepted[i - 1]!).toBeGreaterThanOrEqual(60_000);
        }
      }),
      opts,
    );
  });
});
