import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { MONITORED_IDS } from '../src/airports';
import {
  RECOVERY_PERIOD_MS,
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
        fc.option(fc.integer({ min: -RECOVERY_PERIOD_MS * 2, max: RECOVERY_PERIOD_MS * 2 }), { nil: null }),
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
  it('is recovering iff no active stop and now - lastEndedAt < RECOVERY_PERIOD_MS', () => {
    fc.assert(
      fc.property(
        airportId,
        nowMs,
        fc.oneof(
          fc.integer({ min: -RECOVERY_PERIOD_MS * 2, max: RECOVERY_PERIOD_MS * 2 }),
          fc.constantFrom(-1, 0, 1, RECOVERY_PERIOD_MS - 1, RECOVERY_PERIOD_MS, RECOVERY_PERIOD_MS + 1),
        ),
        (id, now, ageMs) => {
          const result = deriveAirportStatus({
            airportId: id,
            hasData: true,
            activeGroundStop: false,
            lastEndedAt: new Date(now - ageMs).toISOString(),
            now: new Date(now),
          });
          expect(result.kind).toBe(ageMs < RECOVERY_PERIOD_MS ? 'recovering' : 'normal');
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
