import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Incident } from "@aerobrief/core/incidents";
import { reconcileWithSnapshot } from "../src/lib/incident-feed";

const AIRPORTS = ["ORD", "ATL", "LAX"] as const;
type Ap = (typeof AIRPORTS)[number];

interface Spec {
  t: number;
  isStart: boolean;
  airport: Ap;
}

const iso = (t: number): string => new Date(Date.UTC(2026, 10, 24, 0, 0, 0) + t * 60_000).toISOString();

function toIncident(s: Spec): Incident {
  return s.isStart
    ? { incidentKey: `s${s.t}`, type: "GROUND_STOP_STARTED", airportId: s.airport, startedAt: iso(s.t), endedAt: null, durationMs: null }
    : { incidentKey: `e${s.t}`, type: "GROUND_STOP_STARTED", airportId: s.airport, startedAt: iso(s.t), endedAt: iso(s.t), durationMs: 0 };
}

const specs = (airports: readonly Ap[]) =>
  fc.uniqueArray(
    fc.record({ t: fc.integer({ min: 0, max: 5000 }), isStart: fc.boolean(), airport: fc.constantFrom(...airports) }),
    { selector: (s) => s.t, maxLength: 14 },
  );

const activeSet = fc.subarray([...AIRPORTS]).map((a) => new Set<string>(a));

describe("reconcileWithSnapshot properties", () => {
  // Feature: ui-review-fixes, Property 1: Activity reflects the snapshot
  it("Property 1: an incident is active only when its airport is active, and an airport has at most one", () => {
    fc.assert(
      fc.property(specs(AIRPORTS), activeSet, (list, active) => {
        const { incidents } = reconcileWithSnapshot(list.map(toIncident), active);
        const openByAirport = new Map<string, number>();
        for (const i of incidents) {
          if (i.endedAt !== null) continue;
          expect(active.has(i.airportId as string)).toBe(true);
          openByAirport.set(i.airportId as string, (openByAirport.get(i.airportId as string) ?? 0) + 1);
        }
        for (const n of openByAirport.values()) expect(n).toBe(1);
      }),
      { numRuns: 100 },
    );
  });

  // Feature: ui-review-fixes, Property 2: Cross-key pairing matches nearest-earlier-start
  it("Property 2: pairs match a stack-based nearest-earlier-start reference", () => {
    fc.assert(
      fc.property(specs(["ORD"]), (list) => {
        const { incidents } = reconcileWithSnapshot(list.map(toIncident), new Set(["ORD"]));
        const actual = incidents
          .filter((i) => i.endedAt !== null && i.startedAt !== i.endedAt)
          .map((i) => `${i.startedAt}|${i.endedAt}|${i.durationMs}`)
          .sort();
        const stack: number[] = [];
        const expected: string[] = [];
        for (const s of [...list].sort((a, b) => a.t - b.t)) {
          if (s.isStart) stack.push(s.t);
          else {
            const start = stack.pop();
            if (start !== undefined) expected.push(`${iso(start)}|${iso(s.t)}|${(s.t - start) * 60_000}`);
          }
        }
        expect(actual).toEqual(expected.sort());
      }),
      { numRuns: 100 },
    );
  });

  // Feature: ui-review-fixes, Property 3: Unpaired, inactive starts are marked unresolved
  it("Property 3: leftover starts at an inactive airport are ended and flagged", () => {
    fc.assert(
      fc.property(specs(["ORD"]), (list) => {
        const { incidents, endTimeNotRecorded } = reconcileWithSnapshot(list.map(toIncident), new Set());
        expect(incidents.filter((i) => i.endedAt === null)).toEqual([]);
        for (const s of list.filter((x) => x.isStart)) {
          const out = incidents.find((i) => i.incidentKey === `s${s.t}`) as Incident;
          const paired = out.endedAt !== out.startedAt;
          expect(paired || endTimeNotRecorded.has(`s${s.t}`)).toBe(true);
          expect(paired && endTimeNotRecorded.has(`s${s.t}`)).toBe(false);
        }
      }),
      { numRuns: 100 },
    );
  });

  // Feature: ui-review-fixes, Property 4: No snapshot means no reclassification
  it("Property 4: without a snapshot the incidents are returned unchanged", () => {
    fc.assert(
      fc.property(specs(AIRPORTS), (list) => {
        const input = list.map(toIncident);
        const out = reconcileWithSnapshot(input, undefined);
        expect(out.incidents).toEqual(input);
        expect(out.endTimeNotRecorded.size).toBe(0);
      }),
      { numRuns: 100 },
    );
  });
});
