import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { isRateLimited } from '../src/account';

const WINDOW_MS = 60 * 60 * 1000;
const NOW_MIN = 2 * WINDOW_MS;
const NOW_MAX = 4_000_000_000_000;

// Offsets relative to now (ms): negative = before now, positive = after now.
// Concentrated around the window boundaries and now.
const offsetArb: fc.Arbitrary<number> = fc.oneof(
  fc.integer({ min: -2 * WINDOW_MS, max: 2 * WINDOW_MS }),
  fc.integer({ min: -WINDOW_MS - 2, max: -WINDOW_MS + 2 }),
  fc.integer({ min: -2, max: 2 }),
);

// Feature: aerobrief, Property 19: Magic link rate limit
// **Validates: Requirements 7.8**
describe('Property 19: Magic link rate limit', () => {
  it('isRateLimited is true iff 5 or more requests fall in the preceding 60 minutes', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: NOW_MIN, max: NOW_MAX }),
        fc.array(offsetArb, { maxLength: 20 }),
        (nowMs: number, offsets: number[]) => {
          const now = new Date(nowMs);
          const times = offsets.map((o) => new Date(nowMs + o));
          const expected =
            offsets.filter((o) => o <= 0 && -o <= WINDOW_MS).length >= 5;
          expect(isRateLimited(times, now)).toBe(expected);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('is monotonic boundary: exactly 4 in-window plus any out-of-window requests is not limited', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: NOW_MIN, max: NOW_MAX }),
        fc.array(fc.integer({ min: -WINDOW_MS, max: 0 }), { minLength: 4, maxLength: 4 }),
        fc.array(
          fc.oneof(
            fc.integer({ min: -2 * WINDOW_MS, max: -WINDOW_MS - 1 }),
            fc.integer({ min: 1, max: WINDOW_MS }),
          ),
          { maxLength: 10 },
        ),
        (nowMs: number, inWindow: number[], outside: number[]) => {
          const times = [...inWindow, ...outside].map((o) => new Date(nowMs + o));
          expect(isRateLimited(times, new Date(nowMs))).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});
