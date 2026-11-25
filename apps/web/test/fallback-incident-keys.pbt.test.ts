import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { EventSummary } from "../src/api/client";
import { assignIncidentKeys } from "../src/lib/fallback-incident-keys";

// Fallback incident keys for events from an API that sends no incidentKey.
const eventArb: fc.Arbitrary<EventSummary> = fc
  .record({
    type: fc.constantFrom("GROUND_STOP_STARTED", "GROUND_STOP_ENDED", "NATIONWIDE_EVENT", "OTHER"),
    airportId: fc.constantFrom("SFO", "LAX", "ATL"),
    minute: fc.integer({ min: 0, max: 24 * 60 - 1 }),
  })
  .map((r) => ({
    type: r.type,
    airportId: r.type === "NATIONWIDE_EVENT" ? null : r.airportId,
    occurredAt: new Date(Date.UTC(2026, 0, 2, 0, r.minute)).toISOString(),
    explanation: "x",
  }));

describe("assignIncidentKeys properties", () => {
  it("gives every event one key", () => {
    fc.assert(
      fc.property(fc.array(eventArb, { maxLength: 30 }), (events) => {
        const keys = assignIncidentKeys(events);
        expect(keys).toHaveLength(events.length);
        for (const k of keys) expect(k.length).toBeGreaterThan(0);
      }),
    );
  });

  it("shares a key only between a start and a later-or-equal end at the same airport, and never more than two events", () => {
    fc.assert(
      fc.property(fc.array(eventArb, { maxLength: 30 }), (events) => {
        const keys = assignIncidentKeys(events);
        const groups = new Map<string, number[]>();
        keys.forEach((k, i) => groups.set(k, [...(groups.get(k) ?? []), i]));
        for (const idx of groups.values()) {
          expect(idx.length).toBeLessThanOrEqual(2);
          if (idx.length === 2) {
            const [a, b] = idx.map((i) => events[i] as EventSummary);
            const start = a?.type === "GROUND_STOP_STARTED" ? a : b;
            const end = a?.type === "GROUND_STOP_STARTED" ? b : a;
            expect(start?.type).toBe("GROUND_STOP_STARTED");
            expect(end?.type).toBe("GROUND_STOP_ENDED");
            expect(start?.airportId).toBe(end?.airportId);
            expect(Date.parse(start?.occurredAt ?? "")).toBeLessThanOrEqual(Date.parse(end?.occurredAt ?? ""));
          }
        }
      }),
    );
  });
});

it("is deterministic", () => {
  const events: EventSummary[] = [
    { type: "GROUND_STOP_STARTED", airportId: "SFO", occurredAt: "2026-01-02T01:00:00.000Z", explanation: "x" },
  ];
  expect(assignIncidentKeys(events)).toEqual(assignIncidentKeys(events));
});
