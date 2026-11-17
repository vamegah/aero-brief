import { describe, expect, test } from "vitest";
import fc from "fast-check";
import { MONITORED_IDS, type MonitoredId } from "../src/airports";
import {
  type AirportStatus,
  type DetectedEvent,
  type Snapshot,
  affectedArtccs,
  detectChanges,
  nationwideStatus,
} from "../src/change-detector";

// ---------- arbitraries ----------

const isoArb = fc
  .date({ min: new Date("2026-01-01T00:00:00.000Z"), max: new Date("2027-01-01T00:00:00.000Z"), noInvalidDate: true })
  .map((d) => d.toISOString());

/** One slot per airport: null = no ground stop, number = FAA event suffix. */
const slotsArb = fc.array(fc.option(fc.nat(50), { nil: null }), {
  minLength: MONITORED_IDS.length,
  maxLength: MONITORED_IDS.length,
});

function buildSnapshot(slots: readonly (number | null)[], capturedAt: string, id: string): Snapshot {
  const airports: AirportStatus[] = MONITORED_IDS.map((airportId, i) => {
    const slot = slots[i] ?? null;
    return {
      airportId,
      groundStop:
        slot === null
          ? null
          : {
              faaEventId: `faa:${airportId}-${slot}`,
              idSource: "faa_id" as const,
              reason: slot % 2 === 0 ? "wind" : null,
              center: null,
              endTime: null,
            },
    };
  });
  return { id, capturedAt, airports };
}

const snapshotArb: fc.Arbitrary<Snapshot> = fc
  .tuple(slotsArb, isoArb, fc.uuid())
  .map(([slots, at, id]) => buildSnapshot(slots, at, id));

const airportIdArb: fc.Arbitrary<MonitoredId> = fc.constantFrom(...MONITORED_IDS);

// ---------- helpers ----------

const activeCount = (s: Snapshot): number => s.airports.filter((a) => a.groundStop !== null).length;
const isActive = (s: Snapshot | null, id: MonitoredId): boolean =>
  s?.airports.find((a) => a.airportId === id)?.groundStop != null;
const groundStopEvents = (es: DetectedEvent[]) =>
  es.flatMap((e) => (e.type === "NATIONWIDE_EVENT" ? [] : [e]));
const allInactive = (s: Snapshot): Snapshot => ({
  ...s,
  id: "none",
  airports: s.airports.map((a) => ({ airportId: a.airportId, groundStop: null })),
});

describe("change detector properties", () => {
  // Validates: Requirement 3.6 (idempotence)
  test("diffing a snapshot against itself yields no events", () => {fc.assert(fc.property(snapshotArb, (s) => {
    expect(detectChanges(s, s)).toEqual([]);
  }));
  });

  // Validates: Requirement 3.7 (invariant)
  test("started minus ended equals the change in active airport count", () => {fc.assert(fc.property(snapshotArb, snapshotArb, (cur, prev) => {
      const events = groundStopEvents(detectChanges(cur, prev));
      const started = events.filter((e) => e.type === "GROUND_STOP_STARTED").length;
      const ended = events.filter((e) => e.type === "GROUND_STOP_ENDED").length;
      expect(started - ended).toBe(activeCount(cur) - activeCount(prev));
    }));
  });

  // Validates: Requirements 3.2, 3.3, 3.4
  test("an airport emits STARTED only on inactive->active and ENDED only on active->inactive", () => {fc.assert(fc.property(snapshotArb, snapshotArb, (cur, prev) => {
      const events = groundStopEvents(detectChanges(cur, prev));
      for (const id of MONITORED_IDS) {
        const forAirport = events.filter((e) => e.airportId === id);
        const was = isActive(prev, id);
        const now = isActive(cur, id);
        if (!was && now) expect(forAirport.map((e) => e.type)).toEqual(["GROUND_STOP_STARTED"]);
        else if (was && !now) expect(forAirport.map((e) => e.type)).toEqual(["GROUND_STOP_ENDED"]);
        else expect(forAirport).toEqual([]);
      }
    }));
  });

  // Validates: Requirement 3.5
  test("a missing previous snapshot behaves like an all-inactive one", () => {fc.assert(fc.property(snapshotArb, (s) => {
    expect(detectChanges(s, null)).toEqual(detectChanges(s, allInactive(s)));
  }));
  });

  // Validates: Requirement 3.10
  test("airport events are sorted by airport id, one per airport, nationwide last", () => {fc.assert(fc.property(snapshotArb, snapshotArb, (cur, prev) => {
      const events = detectChanges(cur, prev);
      const gs = groundStopEvents(events);
      const ids = gs.map((e) => e.airportId);
      expect(ids).toEqual([...ids].sort());
      expect(new Set(ids).size).toBe(ids.length);
      const nationwideIdx = events.findIndex((e) => e.type === "NATIONWIDE_EVENT");
      if (nationwideIdx !== -1) expect(nationwideIdx).toBe(events.length - 1);
      expect(events.filter((e) => e.type === "NATIONWIDE_EVENT").length).toBeLessThanOrEqual(1);
    }));
  });

  // Validates: Requirements 3.8, 9.10 (event identity)
  test("STARTED takes its FAA event id from current, ENDED from previous; timestamps are the current capture time", () => {fc.assert(fc.property(snapshotArb, snapshotArb, (cur, prev) => {
      for (const e of groundStopEvents(detectChanges(cur, prev))) {
        const source = e.type === "GROUND_STOP_STARTED" ? cur : prev;
        const entry = source.airports.find((a) => a.airportId === e.airportId)?.groundStop;
        expect(entry?.faaEventId).toBe(e.faaEventId);
        expect(e.occurredAt).toBe(cur.capturedAt);
      }
    }));
  });

  // Validates: Requirements 4.1, 4.2, 4.3
  test("NATIONWIDE_EVENT is emitted exactly when 3+ ARTCCs are affected now and fewer than 3 were before", () => {fc.assert(fc.property(snapshotArb, fc.option(snapshotArb, { nil: null }), (cur, prev) => {
      const expected = affectedArtccs(cur).length >= 3 && !(prev !== null && affectedArtccs(prev).length >= 3);
      const found = detectChanges(cur, prev).filter((e) => e.type === "NATIONWIDE_EVENT");
      expect(found.length).toBe(expected ? 1 : 0);
    }));
  });

  // Validates: Requirement 4.6
  test("nationwide count equals the length of a unique, sorted ARTCC list", () => {fc.assert(fc.property(snapshotArb, (s) => {
    const status = nationwideStatus(s);
    expect(status.count).toBe(status.artccs.length);
    expect(new Set(status.artccs).size).toBe(status.artccs.length);
    expect(status.artccs).toEqual([...status.artccs].sort());
    expect(status.active).toBe(status.count >= 3);
    for (const e of detectChanges(s, null)) {
      if (e.type === "NATIONWIDE_EVENT") {
        expect(e.count).toBe(e.affectedArtccs.length);
        expect(e.affectedArtccs).toEqual(status.artccs);
      }
    }
  }));
  });

  // Validates: Requirement 4.7 (monotonicity)
  test("adding an active airport never turns an active nationwide status inactive", () => {fc.assert(fc.property(snapshotArb, airportIdArb, (s, extra) => {
      const grown: Snapshot = {
        ...s,
        airports: s.airports.map((a) =>
          a.airportId === extra && a.groundStop === null
            ? {
                airportId: a.airportId,
                groundStop: { faaEventId: `faa:${extra}-x`, idSource: "faa_id", reason: null, center: null, endTime: null },
              }
            : a,
        ),
      };
      if (nationwideStatus(s).active) expect(nationwideStatus(grown).active).toBe(true);
      expect(nationwideStatus(grown).count).toBeGreaterThanOrEqual(nationwideStatus(s).count);
    }));
  });

  // Validates: Requirement 3.1 (purity)
  test("is pure: equal inputs give equal outputs and inputs are not mutated", () => {fc.assert(fc.property(snapshotArb, fc.option(snapshotArb, { nil: null }), (cur, prev) => {
      const curCopy = structuredClone(cur);
      const prevCopy = structuredClone(prev);
      const first = detectChanges(cur, prev);
      const second = detectChanges(cur, prev);
      expect(second).toEqual(first);
      expect(cur).toEqual(curCopy);
      expect(prev).toEqual(prevCopy);
    }));
  });
});
