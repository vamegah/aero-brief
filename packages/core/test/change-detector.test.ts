import { describe, expect, it } from "vitest";
import { MONITORED_IDS, type MonitoredId } from "../src/airports";
import { affectedArtccs, detectChanges, nationwideStatus } from "../src/change-detector";
import { eventKey } from "../src/event-keys";
import type { Snapshot } from "../src/schemas";

function snap(active: Partial<Record<MonitoredId, { id: string; reason: string | null }>>, at = "2025-01-01T00:00:00Z"): Snapshot {
  return {
    id: "00000000-0000-4000-8000-000000000000",
    capturedAt: at,
    airports: MONITORED_IDS.map((airportId) => {
      const a = active[airportId];
      return {
        airportId,
        groundStop: a
          ? { faaEventId: a.id, idSource: "faa_id" as const, reason: a.reason, center: null, endTime: null, expectedEnd: null, advisoryUrl: null }
          : null,
      };
    }),
  };
}

describe("affectedArtccs / nationwideStatus", () => {
  it("returns unique sorted ARTCCs; same-ARTCC airports count once", () => {
    const s = snap({ JFK: { id: "1", reason: null }, EWR: { id: "2", reason: null }, ATL: { id: "3", reason: null } });
    expect(affectedArtccs(s)).toEqual(["ZNY", "ZTL"]);
    expect(nationwideStatus(s)).toEqual({ active: false, count: 2, artccs: ["ZNY", "ZTL"] });
  });

  it("is active at 3 ARTCCs", () => {
    const s = snap({ JFK: { id: "1", reason: null }, ATL: { id: "2", reason: null }, ORD: { id: "3", reason: null } });
    expect(nationwideStatus(s).active).toBe(true);
  });
});

describe("detectChanges", () => {
  it("null previous treats all as inactive; STARTED uses current data, sorted by airport", () => {
    const cur = snap({ SEA: { id: "b", reason: "WX" }, ATL: { id: "a", reason: null } });
    const ev = detectChanges(cur, null);
    expect(ev).toEqual([
      { type: "GROUND_STOP_STARTED", airportId: "ATL", occurredAt: cur.capturedAt, faaEventId: "a", reason: null },
      { type: "GROUND_STOP_STARTED", airportId: "SEA", occurredAt: cur.capturedAt, faaEventId: "b", reason: "WX" },
    ]);
  });

  it("ENDED takes faaEventId and reason from previous", () => {
    const prev = snap({ DEN: { id: "old", reason: "VOLUME" } });
    const cur = snap({}, "2025-01-01T00:05:00Z");
    expect(detectChanges(cur, prev)).toEqual([
      { type: "GROUND_STOP_ENDED", airportId: "DEN", occurredAt: cur.capturedAt, faaEventId: "old", reason: "VOLUME" },
    ]);
  });

  it("emits no events when unchanged, even if the event id changes", () => {
    const prev = snap({ DEN: { id: "x", reason: null } });
    const cur = snap({ DEN: { id: "y", reason: null } });
    expect(detectChanges(cur, prev)).toEqual([]);
  });

  it("emits one NATIONWIDE_EVENT last when crossing the threshold, not while it stays active", () => {
    const three = { JFK: { id: "1", reason: null }, ATL: { id: "2", reason: null }, ORD: { id: "3", reason: null } };
    const cur = snap(three);
    const ev = detectChanges(cur, snap({}));
    expect(ev.filter((e) => e.type === "NATIONWIDE_EVENT")).toHaveLength(1);
    expect(ev[ev.length - 1]).toEqual({
      type: "NATIONWIDE_EVENT",
      occurredAt: cur.capturedAt,
      count: 3,
      affectedArtccs: ["ZAU", "ZNY", "ZTL"],
    });
    expect(detectChanges(snap({ ...three, LAX: { id: "4", reason: null } }), cur).some((e) => e.type === "NATIONWIDE_EVENT")).toBe(false);
  });

  it("flapping airport yields STARTED, ENDED, STARTED across consecutive polls", () => {
    const on = (at: string) => snap({ DEN: { id: "d1", reason: "WX" } }, at);
    const off = (at: string) => snap({}, at);
    const s0 = off("2025-01-01T00:00:00Z");
    const s1 = on("2025-01-01T00:05:00Z");
    const s2 = off("2025-01-01T00:10:00Z");
    const s3 = on("2025-01-01T00:15:00Z");
    expect(detectChanges(s1, s0).map((e) => e.type)).toEqual(["GROUND_STOP_STARTED"]);
    expect(detectChanges(s2, s1).map((e) => e.type)).toEqual(["GROUND_STOP_ENDED"]);
    expect(detectChanges(s3, s2).map((e) => e.type)).toEqual(["GROUND_STOP_STARTED"]);
  });

  it("exactly 2 Affected_ARTCCs emits no NATIONWIDE_EVENT", () => {
    const cur = snap({ JFK: { id: "1", reason: null }, ATL: { id: "2", reason: null } });
    expect(detectChanges(cur, null).some((e) => e.type === "NATIONWIDE_EVENT")).toBe(false);
  });

  it("two airports in one ARTCC count once toward the threshold", () => {
    const cur = snap({
      JFK: { id: "1", reason: null },
      EWR: { id: "2", reason: null },
      ATL: { id: "3", reason: null },
    });
    expect(nationwideStatus(cur).count).toBe(2);
    expect(detectChanges(cur, null).some((e) => e.type === "NATIONWIDE_EVENT")).toBe(false);
  });

  it("re-emits NATIONWIDE_EVENT after dropping below the threshold and crossing again", () => {
    const three = { JFK: { id: "1", reason: null }, ATL: { id: "2", reason: null }, ORD: { id: "3", reason: null } };
    const high = snap(three);
    const low = snap({ JFK: { id: "1", reason: null } });
    expect(detectChanges(low, high).some((e) => e.type === "NATIONWIDE_EVENT")).toBe(false);
    expect(detectChanges(high, low).some((e) => e.type === "NATIONWIDE_EVENT")).toBe(true);
  });

  it("does not mutate inputs", () => {
    const cur = snap({ JFK: { id: "1", reason: null } });
    const before = JSON.stringify(cur);
    detectChanges(cur, null);
    expect(JSON.stringify(cur)).toBe(before);
  });
});

describe("incident keys across a ground stop lifecycle", () => {
  const keyOf = (cur: Snapshot, prev: Snapshot | null) =>
    detectChanges(cur, prev).map((e) => ({ type: e.type, key: eventKey(e, prev?.id ?? null) }));
  it("the STARTED and ENDED events of one stop share an event key", () => {
    const empty = snap({}, "2025-01-01T01:00:00Z");
    const active = snap({ JFK: { id: "stop-1", reason: null } });
    const started = keyOf(active, empty);
    const ended = keyOf(empty, active);
    expect(started).toEqual([{ type: "GROUND_STOP_STARTED", key: "stop-1" }]);
    expect(ended).toEqual([{ type: "GROUND_STOP_ENDED", key: "stop-1" }]);
  });
  it("two different stops at the same airport get different event keys", () => {
    const empty = snap({});
    const first = keyOf(snap({ JFK: { id: "stop-1", reason: null } }), empty);
    const second = keyOf(snap({ JFK: { id: "stop-2", reason: null } }), empty);
    expect(first[0]?.key).not.toBe(second[0]?.key);
  });
});
