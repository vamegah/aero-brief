import { describe, expect, it } from "vitest";
import type { EventSummary } from "../src/api/client";
import { NO_EVENT_FILTER } from "../src/lib/filter-events";
import {
  buildIncidentFeed,
  feedSize,
  filterIncidentFeed,
  latestEndedKeys,
  limitFeed,
  toCoreEvent,
} from "../src/lib/incident-feed";

function ev(over: Partial<EventSummary> & { incidentKey: string; type: string; occurredAt: string }): EventSummary {
  return { airportId: "ATL", explanation: "raw text that must not leak", ...over };
}

const started = ev({ incidentKey: "a", type: "GROUND_STOP_STARTED", occurredAt: "2026-01-02T10:00:00.000Z" });
const ended = ev({ incidentKey: "a", type: "GROUND_STOP_ENDED", occurredAt: "2026-01-02T11:00:00.000Z" });
const activeLax = ev({ incidentKey: "b", type: "GROUND_STOP_STARTED", airportId: "LAX", occurredAt: "2026-01-02T09:00:00.000Z" });
const nationwide = ev({ incidentKey: "N", type: "NATIONWIDE_EVENT", airportId: null, occurredAt: "2026-01-02T08:00:00.000Z" });
const unknown = ev({ incidentKey: "u", type: "SOMETHING_NEW", occurredAt: "2026-01-02T07:00:00.000Z" });

describe("toCoreEvent", () => {
  it("maps ground stop events and keeps the incident key", () => {
    expect(toCoreEvent(started)).toMatchObject({ type: "GROUND_STOP_STARTED", airportId: "ATL", incidentKey: "a" });
  });

  it("maps a nationwide event without an airport", () => {
    expect(toCoreEvent(nationwide)).toMatchObject({ type: "NATIONWIDE_EVENT", incidentKey: "N" });
  });

  it("returns null for an unknown type, a missing airport or an unmonitored airport", () => {
    expect(toCoreEvent(unknown)).toBeNull();
    expect(toCoreEvent({ ...started, airportId: null })).toBeNull();
    expect(toCoreEvent({ ...started, airportId: "ZZZ" })).toBeNull();
  });

  it("does not carry the explanation text", () => {
    expect(JSON.stringify(toCoreEvent(started))).not.toContain("raw text");
  });
});

describe("buildIncidentFeed", () => {
  const feed = buildIncidentFeed([ended, started, activeLax, nationwide, unknown]);

  it("merges a started and ended pair and sorts active first, then by end time", () => {
    expect(feed.incidents.map((i) => i.incidentKey)).toEqual(["b", "N", "a"].sort((x, y) => order(x) - order(y)));
    expect(feed.incidents.at(-1)).toMatchObject({ incidentKey: "a", endedAt: ended.occurredAt, durationMs: 3_600_000 });
  });

  it("keeps unrecognized events apart and counts them", () => {
    expect(feed.others).toEqual([unknown]);
    expect(feedSize(feed)).toBe(4);
  });
});

function order(key: string): number {
  // Active incidents (b, N) come first, newest start first: b (09:00) then N (08:00); ended "a" last.
  return { b: 0, N: 1, a: 2 }[key] ?? 9;
}

describe("filterIncidentFeed", () => {
  const feed = buildIncidentFeed([started, ended, activeLax, nationwide, unknown]);

  it("passes everything with no filter", () => {
    expect(filterIncidentFeed(feed, NO_EVENT_FILTER)).toEqual(feed);
  });

  it("filters by airport and excludes system-wide incidents", () => {
    const out = filterIncidentFeed(feed, { airportId: "ATL", type: null });
    expect(out.incidents.map((i) => i.incidentKey)).toEqual(["a"]);
    expect(out.others).toEqual([unknown]); // the unknown event is also at ATL
  });

  it("filters by type on incidents", () => {
    const keys = (type: string) => filterIncidentFeed(feed, { airportId: null, type }).incidents.map((i) => i.incidentKey);
    expect(keys("GROUND_STOP_ENDED")).toEqual(["a"]);
    expect(keys("GROUND_STOP_STARTED").sort()).toEqual(["a", "b"]);
    expect(keys("NATIONWIDE_EVENT")).toEqual(["N"]);
  });
});

describe("filterIncidentFeed state filter", () => {
  const feed = buildIncidentFeed([started, ended, activeLax, nationwide, unknown]);
  const keys = (state: "active" | "ended" | null) =>
    filterIncidentFeed(feed, { airportId: null, type: null, state }).incidents.map((i) => i.incidentKey);

  it("keeps active incidents or ended incidents, and drops unrecognised events", () => {
    expect(keys("active").sort()).toEqual(["N", "b"]);
    expect(keys("ended")).toEqual(["a"]);
    expect(filterIncidentFeed(feed, { airportId: null, type: null, state: "active" }).others).toEqual([]);
    expect(keys(null)).toHaveLength(3);
  });

  it("combines with the airport and type filters", () => {
    const out = filterIncidentFeed(feed, { airportId: "ATL", type: "GROUND_STOP_STARTED", state: "active" });
    expect(out.incidents).toEqual([]);
  });
});

describe("limitFeed and latestEndedKeys", () => {
  it("limits to the first N cards, incidents first", () => {
    const feed = buildIncidentFeed([started, ended, activeLax, nationwide, unknown]);
    expect(feedSize(limitFeed(feed, 2))).toBe(2);
    expect(feedSize(limitFeed(feed, 10))).toBe(4);
  });

  it("marks only the latest ended incident of each airport", () => {
    const older = [
      ev({ incidentKey: "o1", type: "GROUND_STOP_STARTED", occurredAt: "2026-01-02T01:00:00.000Z" }),
      ev({ incidentKey: "o1", type: "GROUND_STOP_ENDED", occurredAt: "2026-01-02T02:00:00.000Z" }),
    ];
    const { incidents } = buildIncidentFeed([...older, started, ended]);
    expect([...latestEndedKeys(incidents)]).toEqual(["a"]);
  });
});
