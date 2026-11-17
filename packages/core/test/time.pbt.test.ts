import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { withinRetention, RETENTION_MS } from '../src/time';

const MAX_MS = 4_000_000_000_000;

// Feature: aerobrief, Property 29: Retention partition
// **Validates: Requirements 11.1, 11.2, 11.3**
describe('Property 29: Retention partition', () => {
  it('withinRetention is true iff age <= 86,400,000 ms (boundary exact)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: RETENTION_MS * 2, max: MAX_MS }),
        fc.oneof(
          fc.integer({ min: -RETENTION_MS * 2, max: RETENTION_MS * 2 }),
          fc.constantFrom(-1, 0, 1, RETENTION_MS - 1, RETENTION_MS, RETENTION_MS + 1),
        ),
        (nowMs, ageMs) => {
          const now = new Date(nowMs);
          const ts = new Date(nowMs - ageMs).toISOString();
          expect(withinRetention(ts, now)).toBe(ageMs <= RETENTION_MS);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('deletion set is exactly the complement of the kept set', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: RETENTION_MS * 2, max: MAX_MS }),
        fc.array(fc.integer({ min: -RETENTION_MS, max: RETENTION_MS * 2 }), { maxLength: 50 }),
        (nowMs, ages) => {
          const now = new Date(nowMs);
          const records = ages.map((a, id) => ({ id, ts: new Date(nowMs - a).toISOString() }));
          const kept = records.filter((r) => withinRetention(r.ts, now));
          const deleted = records.filter((r) => !withinRetention(r.ts, now));
          expect(kept.length + deleted.length).toBe(records.length);
          const keptIds = new Set(kept.map((r) => r.id));
          expect(deleted.every((r) => !keptIds.has(r.id))).toBe(true);
          expect(kept.every((r) => ages[r.id]! <= RETENTION_MS)).toBe(true);
          expect(deleted.every((r) => ages[r.id]! > RETENTION_MS)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});
