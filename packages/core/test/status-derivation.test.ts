import { describe, it, expect } from 'vitest';
import { MONITORED_IDS } from '../src/airports';
import {
  AIRPORT_STATUS_KINDS,
  RECOVERY_PERIOD_MS,
  STATUS_CATALOG,
  deriveAirportStatus,
  normalizationEstimate,
  summarizeNetwork,
} from '../src/status-derivation';

const NOW = new Date('2026-11-24T12:00:00.000Z');

describe('deriveAirportStatus', () => {
  it('never returns minor_impact or disrupted', () => {
    for (const hasData of [true, false]) {
      for (const activeGroundStop of [true, false]) {
        for (const lastEndedAt of [null, NOW.toISOString(), '2020-01-01T00:00:00.000Z', 'garbage']) {
          const r = deriveAirportStatus({ airportId: 'ATL', hasData, activeGroundStop, lastEndedAt, now: NOW });
          expect(r.kind).not.toBe('minor_impact');
          expect(r.kind).not.toBe('disrupted');
        }
      }
    }
  });

  it('is normal with no events', () => {
    expect(deriveAirportStatus({ airportId: 'ATL', hasData: true, activeGroundStop: false, lastEndedAt: null, now: NOW })).toEqual({
      airportId: 'ATL',
      kind: 'normal',
    });
  });

  it('is ground_stop when a new stop begins during the recovery period', () => {
    const r = deriveAirportStatus({
      airportId: 'JFK',
      hasData: true,
      activeGroundStop: true,
      lastEndedAt: new Date(NOW.getTime() - 60_000).toISOString(),
      now: NOW,
    });
    expect(r.kind).toBe('ground_stop');
  });

  it('is recovering with elapsed time and an estimate from the stop duration', () => {
    const ended = new Date(NOW.getTime() - 30 * 60_000);
    const started = new Date(ended.getTime() - 60 * 60_000);
    const r = deriveAirportStatus({
      airportId: 'EWR',
      hasData: true,
      activeGroundStop: false,
      lastEndedAt: ended.toISOString(),
      lastStartedAt: started.toISOString(),
      now: NOW,
    });
    expect(r.kind).toBe('recovering');
    expect(r.recoveringSinceMs).toBe(30 * 60_000);
    expect(r.normalizationEstimateMinutes).toEqual([30, 90]);
  });

  it('is normal exactly at the end of the recovery period', () => {
    const r = deriveAirportStatus({
      airportId: 'ORD',
      hasData: true,
      activeGroundStop: false,
      lastEndedAt: new Date(NOW.getTime() - RECOVERY_PERIOD_MS).toISOString(),
      now: NOW,
    });
    expect(r.kind).toBe('normal');
  });

  it('is data_unavailable without data, even with an active stop', () => {
    expect(deriveAirportStatus({ airportId: 'LAX', hasData: false, activeGroundStop: true, lastEndedAt: null, now: NOW }).kind).toBe(
      'data_unavailable',
    );
  });
});

describe('normalizationEstimate', () => {
  it('uses 0.5x to 1.5x of the duration', () => {
    expect(normalizationEstimate(120 * 60_000)).toEqual([60, 180]);
  });

  it('widens short stops to a 15 minute window', () => {
    expect(normalizationEstimate(0)).toEqual([0, 15]);
    expect(normalizationEstimate(10 * 60_000)).toEqual([5, 20]);
  });

  it('treats negative and non-finite durations as 0', () => {
    expect(normalizationEstimate(-5)).toEqual([0, 15]);
    expect(normalizationEstimate(Number.NaN)).toEqual([0, 15]);
  });
});

describe('STATUS_CATALOG', () => {
  it('has a distinct icon, a color and a label for all six kinds', () => {
    expect(Object.keys(STATUS_CATALOG).sort()).toEqual([...AIRPORT_STATUS_KINDS].sort());
    const icons = new Set(AIRPORT_STATUS_KINDS.map((k) => STATUS_CATALOG[k].icon));
    const labels = new Set(AIRPORT_STATUS_KINDS.map((k) => STATUS_CATALOG[k].label));
    expect(icons.size).toBe(6);
    expect(labels.size).toBe(6);
    for (const k of AIRPORT_STATUS_KINDS) {
      expect(STATUS_CATALOG[k].color).toMatch(/^color-/);
      expect(STATUS_CATALOG[k].label.length).toBeGreaterThan(0);
    }
  });

  it('marks minor_impact and disrupted as not derived', () => {
    expect(STATUS_CATALOG.minor_impact.derived).toBe(false);
    expect(STATUS_CATALOG.disrupted.derived).toBe(false);
    expect(STATUS_CATALOG.ground_stop.derived).toBe(true);
  });
});

describe('summarizeNetwork', () => {
  it('reports allNormal for 30 normal airports', () => {
    const s = summarizeNetwork(MONITORED_IDS.map((airportId) => ({ airportId, kind: 'normal' as const })));
    expect(s.allNormal).toBe(true);
    expect(s.counts.normal).toBe(30);
    expect(s.affected).toEqual([]);
  });

  it('lists non-normal airports and counts per kind', () => {
    const s = summarizeNetwork([
      { airportId: 'ATL', kind: 'ground_stop' },
      { airportId: 'BOS', kind: 'recovering' },
      { airportId: 'DEN', kind: 'normal' },
    ]);
    expect(s.allNormal).toBe(false);
    expect(s.counts).toMatchObject({ ground_stop: 1, recovering: 1, normal: 1, data_unavailable: 0 });
    expect(s.affected.map((a) => a.airportId)).toEqual(['ATL', 'BOS']);
  });
});
