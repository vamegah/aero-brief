import { describe, expect, test } from "vitest";
import fc from "fast-check";
import { MONITORED_IDS, type MonitoredId } from "../src/airports";
import type { AirportStatus, DetectedEvent, GroundStopEvent } from "../src/change-detector";
import {
  type AlertCandidate,
  claimAlerts,
  deriveFaaEventId,
} from "../src/dedupe";
import { dedupKey, eventKey } from "../src/event-keys";

// ---------- arbitraries ----------

const airportIdArb: fc.Arbitrary<MonitoredId> = fc.constantFrom(...MONITORED_IDS);
const tokenArb = fc.stringMatching(/^[a-z0-9]{1,8}$/);
const isoArb = fc
  .date({ min: new Date("2026-01-01T00:00:00.000Z"), max: new Date("2027-01-01T00:00:00.000Z"), noInvalidDate: true })
  .map((d) => d.toISOString());
const blankArb = fc.constantFrom<string | null | undefined>(null, undefined, "", "   ", "\t");
const nonBlankIdArb = fc.oneof(tokenArb, fc.nat(1_000_000));

const groundStopEventArb: fc.Arbitrary<GroundStopEvent> = fc.record({
  type: fc.constantFrom("GROUND_STOP_STARTED" as const, "GROUND_STOP_ENDED" as const),
  airportId: airportIdArb,
  occurredAt: isoArb,
  faaEventId: tokenArb.map((t) => `faa:${t}`),
  reason: fc.constant(null),
});

const nationwideEventArb: fc.Arbitrary<DetectedEvent> = fc.record({
  type: fc.constant("NATIONWIDE_EVENT" as const),
  occurredAt: isoArb,
  count: fc.integer({ min: 3, max: 18 }),
  affectedArtccs: fc.constant<string[]>(["ZAB", "ZBW", "ZDC"]),
});

const eventArb: fc.Arbitrary<DetectedEvent> = fc.oneof(groundStopEventArb, nationwideEventArb);

const candidateArb: fc.Arbitrary<AlertCandidate> = fc.record({
  event: eventArb,
  previousSnapshotId: fc.option(tokenArb, { nil: null }),
  userId: tokenArb,
});

const firstSeenEntry = (airportId: MonitoredId, faaEventId: string): AirportStatus => ({
  airportId,
  groundStop: { faaEventId, idSource: "first_seen", reason: null, center: null, endTime: null },
});

describe("FAA_Event_ID derivation properties", () => {
  // Validates: Requirement 9.10, Assumption 7 rule 1
  test("uses the FAA id when present, independent of start time, capture time and previous entry", () => {fc.assert(fc.property(airportIdArb, nonBlankIdArb, fc.option(isoArb, { nil: null }), isoArb, (airport, id, startTime, capturedAt) => {
      const a = deriveFaaEventId(airport, { id, startTime }, capturedAt, null);
      const b = deriveFaaEventId(airport, { id, startTime: null }, "2026-06-01T00:00:00.000Z", firstSeenEntry(airport, "seen:x"));
      expect(a.idSource).toBe("faa_id");
      expect(a.faaEventId).toBe(`faa:${String(id).trim()}`);
      expect(b).toEqual({ faaEventId: a.faaEventId, idSource: "faa_id" });
    }));
  });

  // Validates: Assumption 7 rule 2
  test("falls back to airport + start time when the id is blank, independent of capture time", () => {fc.assert(fc.property(airportIdArb, blankArb, isoArb, isoArb, isoArb, (airport, id, startTime, capA, capB) => {
      const a = deriveFaaEventId(airport, { id, startTime }, capA, null);
      const b = deriveFaaEventId(airport, { id, startTime }, capB, null);
      expect(a.idSource).toBe("start_time");
      expect(a.faaEventId).toBe(`start:${airport}:${new Date(startTime).toISOString()}`);
      expect(b).toEqual(a);
    }));
  });

  // Validates: Assumption 7 (unparseable start time counts as absent, never throws)
  test("an unparseable start time is treated as absent", () => {fc.assert(fc.property(airportIdArb, blankArb, fc.constantFrom("not a date", "", "yesterday-ish", "2026-13-45"), isoArb, (airport, id, startTime, capturedAt) => {
      const r = deriveFaaEventId(airport, { id, startTime }, capturedAt, null);
      expect(r).toEqual({ faaEventId: `seen:${airport}:${capturedAt}`, idSource: "first_seen" });
    }));
  });

  // Validates: Assumption 7 rule 3 (stability while the stop stays active)
  test("the first-seen id stays constant across consecutive snapshots of one ground stop", () => {fc.assert(fc.property(airportIdArb, fc.array(isoArb, { minLength: 1, maxLength: 12 }), (airport, captures) => {
      let previous: AirportStatus | null = null;
      const ids: string[] = [];
      for (const capturedAt of captures) {
        const r = deriveFaaEventId(airport, {}, capturedAt, previous);
        ids.push(r.faaEventId);
        previous = firstSeenEntry(airport, r.faaEventId);
      }
      expect(new Set(ids).size).toBe(1);
      expect(ids[0]).toBe(`seen:${airport}:${captures[0]}`);
    }));
  });

  // Validates: Assumption 7 (a previous entry with a stronger id source is not carried forward)
  test("a previous faa_id entry is not carried forward to a new id-less ground stop", () => {fc.assert(fc.property(airportIdArb, tokenArb, isoArb, (airport, token, capturedAt) => {
      const previous: AirportStatus = {
        airportId: airport,
        groundStop: { faaEventId: `faa:${token}`, idSource: "faa_id", reason: null, center: null, endTime: null },
      };
      const r = deriveFaaEventId(airport, {}, capturedAt, previous);
      expect(r.faaEventId).toBe(`seen:${airport}:${capturedAt}`);
    }));
  });
});

describe("event keys and dedup keys", () => {
  // Validates: Requirement 9.10 (STARTED and ENDED of one stop share a key, get separate alerts)
  test("STARTED and ENDED for one FAA event share an event key but not a dedup key", () => {fc.assert(fc.property(groundStopEventArb, fc.option(tokenArb, { nil: null }), tokenArb, (e, prevId, user) => {
      const started: DetectedEvent = { ...e, type: "GROUND_STOP_STARTED" };
      const ended: DetectedEvent = { ...e, type: "GROUND_STOP_ENDED" };
      expect(eventKey(started, prevId)).toBe(eventKey(ended, prevId));
      expect(dedupKey(started, prevId, user)).not.toBe(dedupKey(ended, prevId, user));
    }));
  });

  // Validates: design "Keys" (ground stop key is the FAA id, not the Snapshot)
  test("a ground stop event key ignores snapshot identity and capture time", () => {fc.assert(fc.property(groundStopEventArb, fc.option(tokenArb, { nil: null }), fc.option(tokenArb, { nil: null }), isoArb, (e, prevA, prevB, otherTime) => {
      expect(eventKey(e, prevA)).toBe(e.faaEventId);
      expect(eventKey({ ...e, occurredAt: otherTime }, prevB)).toBe(eventKey(e, prevA));
    }));
  });

  // Validates: design "Keys" (nationwide key depends only on the previous snapshot id)
  test("a nationwide event key depends only on the previous snapshot id", () => {fc.assert(fc.property(nationwideEventArb, fc.option(tokenArb, { nil: null }), isoArb, (e, prevId, otherTime) => {
      expect(eventKey({ ...e, occurredAt: otherTime }, prevId)).toBe(eventKey(e, prevId));
    }));
  });

  // Validates: Requirement 9.10 (distinct users never collide)
  test("dedup keys are deterministic and differ for different users", () => {fc.assert(fc.property(eventArb, fc.option(tokenArb, { nil: null }), tokenArb, tokenArb, (e, prevId, u1, u2) => {
      expect(dedupKey(e, prevId, u1)).toBe(dedupKey(e, prevId, u1));
      if (u1 !== u2) expect(dedupKey(e, prevId, u1)).not.toBe(dedupKey(e, prevId, u2));
    }));
  });
});

describe("alert claiming (retried polls never duplicate emails)", () => {
  // Validates: Requirements 9.4, 9.10 (at most one per event key, type and user within a batch)
  test("never sends two alerts with the same dedup key", () => {fc.assert(fc.property(fc.array(candidateArb, { maxLength: 40 }), (candidates) => {
      const { toSend } = claimAlerts(candidates, new Set());
      const keys = toSend.map((c) => dedupKey(c.event, c.previousSnapshotId, c.userId));
      expect(new Set(keys).size).toBe(keys.length);
      for (const c of toSend) expect(candidates).toContain(c);
    }));
  });

  // Validates: Requirement 9.9 (idempotence under a retried poll)
  test("processing the same candidates twice sends nothing the second time", () => {fc.assert(fc.property(fc.array(candidateArb, { maxLength: 40 }), (candidates) => {
      const first = claimAlerts(candidates, new Set());
      const second = claimAlerts(candidates, first.claimed);
      expect(second.toSend).toEqual([]);
      expect(second.claimed).toEqual(first.claimed);
    }));
  });

  // Validates: Requirement 9.10 (a retried poll re-detects the same FAA event in a new snapshot)
  test("re-detecting the same FAA event in a later snapshot sends no duplicate", () => {fc.assert(fc.property(groundStopEventArb, tokenArb, isoArb, fc.option(tokenArb, { nil: null }), fc.option(tokenArb, { nil: null }), (e, user, laterTime, prevA, prevB) => {
      const original: AlertCandidate = { event: e, previousSnapshotId: prevA, userId: user };
      const retried: AlertCandidate = { event: { ...e, occurredAt: laterTime }, previousSnapshotId: prevB, userId: user };
      const first = claimAlerts([original], new Set());
      expect(first.toSend).toHaveLength(1);
      expect(claimAlerts([retried], first.claimed).toSend).toEqual([]);
    }));
  });

  // Validates: Requirement 9.1 (one alert each for STARTED and ENDED of one stop)
  test("STARTED then ENDED for the same FAA event sends two alerts", () => {fc.assert(fc.property(groundStopEventArb, tokenArb, (e, user) => {
      const started: AlertCandidate = { event: { ...e, type: "GROUND_STOP_STARTED" }, previousSnapshotId: null, userId: user };
      const ended: AlertCandidate = { event: { ...e, type: "GROUND_STOP_ENDED" }, previousSnapshotId: null, userId: user };
      const first = claimAlerts([started], new Set());
      const second = claimAlerts([ended], first.claimed);
      expect(first.toSend).toHaveLength(1);
      expect(second.toSend).toHaveLength(1);
    }));
  });

  // Validates: Requirement 9.10 (claimed set only grows)
  test("keeps every previously claimed key", () => {fc.assert(fc.property(fc.array(candidateArb, { maxLength: 30 }), fc.array(fc.string(), { maxLength: 10 }), (candidates, existing) => {
      const before = new Set(existing);
      const { claimed } = claimAlerts(candidates, before);
      for (const k of before) expect(claimed.has(k)).toBe(true);
    }));
  });
});
