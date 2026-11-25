import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { MONITORED_IDS } from '../src/airports';
import {
  RECOVERY_MAX_MS,
  RECOVERY_MIN_MS,
  recoveryWindowMs,
  MIN_ESTIMATE_WINDOW_MINUTES,
  AIRPORT_STATUS_KINDS,
  deriveAirportStatus,
  summarizeNetwork,
  normalizationEstimate,
  type DerivedAirportStatus,
} from '../src/status-derivation';

const NOW_MIN = 1_000_000_000_000;
const NOW_MAX = 4_000_000_000_000;

const airportId = fc.constantFrom(...MONITORED_IDS);
const nowMs = fc.integer({ min: NOW_MIN, max: NOW_MAX });

const derivedStatus: fc.Arbitrary<DerivedAirportStatus> = fc.record({
  airportId,
  kind: fc.constantFrom(...AIRPORT_STATUS_KINDS),
});

// Feature: ui-improvements, Property 1: Status derivation returns exactly one of the four live statuses
// **Validates: Requirements 1.1, 1.2**
describe('Property 1: Status derivation returns exactly one of the four live statuses', () => {
  it('returns a live kind and respects precedence data_unavailable > ground_stop > recovering > normal', () => {
    fc.assert(
      fc.property(
        airportId,
        fc.boolean(),
        fc.boolean(),
        nowMs,
        fc.option(fc.integer({ min: -RECOVERY_MAX_MS * 2, max: RECOVERY_MAX_MS * 2 }), { nil: null }),
        (id, hasData, activeGroundStop, now, offset) => {
          const lastEndedAt = offset === null ? null : new Date(now - offset).toISOString();
          const result = deriveAirportStatus({
            airportId: id,
            hasData,
            activeGroundStop,
            lastEndedAt,
            now: new Date(now),
          });
          expect(['normal', 'ground_stop', 'recovering', 'data_unavailable']).toContain(result.kind);
          expect(result.airportId).toBe(id);
          if (!hasData) expect(result.kind).toBe('data_unavailable');
          else if (activeGroundStop) expect(result.kind).toBe('ground_stop');
        },
      ),
      { numRuns: 200 },
    );
  });
});

// Feature: ui-improvements, Property 2: Recovery window boundary
// **Validates: Requirements 1.2**
describe('Property 2: Recovery window boundary', () => {
  it('with an unknown duration is recovering iff no active stop and now - lastEndedAt < RECOVERY_MAX_MS', () => {
    fc.assert(
      fc.property(
        airportId,
        nowMs,
        fc.oneof(
          fc.integer({ min: -RECOVERY_MAX_MS * 2, max: RECOVERY_MAX_MS * 2 }),
          fc.constantFrom(-1, 0, 1, RECOVERY_MAX_MS - 1, RECOVERY_MAX_MS, RECOVERY_MAX_MS + 1),
        ),
        (id, now, ageMs) => {
          const result = deriveAirportStatus({
            airportId: id,
            hasData: true,
            activeGroundStop: false,
            lastEndedAt: new Date(now - ageMs).toISOString(),
            now: new Date(now),
          });
          expect(result.kind).toBe(ageMs < RECOVERY_MAX_MS ? 'recovering' : 'normal');
          if (result.kind === 'recovering') {
            expect(result.recoveringSinceMs).toBe(Math.max(0, ageMs));
            expect(result.normalizationEstimateMinutes).toBeDefined();
          } else {
            expect(result.recoveringSinceMs).toBeUndefined();
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});

const durationMsArb = fc.oneof(
  fc.integer({ min: 0, max: 40 * 24 * 3_600_000 }),
  fc.constantFrom(0, 20 * 60_000, 40 * 60_000, 2 * 3_600_000, 16 * 3_600_000, 17 * 3_600_000),
);

// Feature: ui-review-fixes, Property 6: Recovery window is the clamped estimate upper bound
// **Validates: Requirements 19.1, 19.2, 19.3, 19.4, 19.6**
describe('Property 6: Recovery window is the clamped estimate upper bound', () => {
  it('is recovering iff elapsed < clamp(estimateHigh, 1 h, 24 h); unknown duration uses 24 h', () => {
    fc.assert(
      fc.property(
        airportId,
        nowMs,
        fc.option(durationMsArb, { nil: null }),
        fc.integer({ min: 0, max: RECOVERY_MAX_MS + 3_600_000 }),
        fc.boolean(),
        (id, now, duration, ageRaw, atLimit) => {
          const limit = duration === null ? RECOVERY_MAX_MS : Math.min(RECOVERY_MAX_MS, Math.max(RECOVERY_MIN_MS, normalizationEstimate(duration)[1] * 60_000));
          expect(recoveryWindowMs(duration)).toBe(limit);
          const ageMs = atLimit ? limit : ageRaw;
          for (const a of [ageMs - 1, ageMs, ageMs + 1]) {
            const result = deriveAirportStatus({
              airportId: id,
              hasData: true,
              activeGroundStop: false,
              lastEndedAt: new Date(now - a).toISOString(),
              lastEndedDurationMs: duration,
              now: new Date(now),
            });
            expect(result.kind).toBe(a < limit ? 'recovering' : 'normal');
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});

// Feature: ui-review-fixes, Property 7: Recovery window is monotone in stop duration and bounded
// **Validates: Requirements 19.2, 19.4, 19.6**
describe('Property 7: Recovery window is monotone in stop duration and bounded', () => {
  it('never shrinks as the stop gets longer and stays within [1 h, 24 h]', () => {
    fc.assert(
      fc.property(durationMsArb, durationMsArb, (a, b) => {
        const [short, long] = a <= b ? [a, b] : [b, a];
        expect(recoveryWindowMs(short)).toBeLessThanOrEqual(recoveryWindowMs(long));
        for (const d of [a, b, null]) {
          expect(recoveryWindowMs(d)).toBeGreaterThanOrEqual(RECOVERY_MIN_MS);
          expect(recoveryWindowMs(d)).toBeLessThanOrEqual(RECOVERY_MAX_MS);
        }
      }),
      { numRuns: 200 },
    );
  });
});

// Feature: ui-improvements, Property 3: Network summary counts and affected list are consistent
// **Validates: Requirements 1.3**
describe('Property 3: Network summary counts and affected list are consistent', () => {
  it('counts sum to the input length and affected is exactly the non-normal airports', () => {
    fc.assert(
      fc.property(fc.array(derivedStatus, { minLength: 0, maxLength: 30 }), (statuses) => {
        const summary = summarizeNetwork(statuses);
        const total = Object.values(summary.counts).reduce((a, b) => a + b, 0);
        expect(total).toBe(statuses.length);
        const expected = statuses.filter((s) => s.kind !== 'normal').map((s) => ({ airportId: s.airportId, kind: s.kind }));
        expect(summary.affected).toEqual(expected);
        expect(summary.allNormal).toBe(expected.length === 0);
      }),
      { numRuns: 200 },
    );
  });
});

// Feature: ui-improvements, Property 4: Normalization estimate is a non-empty, ordered range
// **Validates: Requirements 1.6**
describe('Property 4: Normalization estimate is a non-empty, ordered range', () => {
  it('returns [low, high] with 0 <= low <= high and a window of at least 15 minutes', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 30 * 24 * 60 * 60 * 1000 }), (durationMs) => {
        const [low, high] = normalizationEstimate(durationMs);
        expect(low).toBeGreaterThanOrEqual(0);
        expect(low).toBeLessThanOrEqual(high);
        expect(high - low).toBeGreaterThanOrEqual(MIN_ESTIMATE_WINDOW_MINUTES);
        expect(normalizationEstimate(durationMs)).toEqual([low, high]);
      }),
      { numRuns: 200 },
    );
  });
});
