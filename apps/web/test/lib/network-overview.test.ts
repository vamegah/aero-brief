import { describe, expect, it } from "vitest";
import { buildNetworkOverview, formatEstimate, formatSinceEnd } from "../../src/lib/network-overview";

const NOW = new Date("2026-01-02T12:00:00.000Z");
const airports = ["ATL", "LAX", "ORD"].map((id) => ({ airportId: id, name: `Airport ${id}`, groundStop: null as unknown }));

function overview(over: Partial<Parameters<typeof buildNetworkOverview>[0]> = {}) {
  return buildNetworkOverview({ airports, events: [], stale: false, hasData: true, now: NOW, ...over });
}

describe("buildNetworkOverview", () => {
  it("says all airports operate normally with no events", () => {
    const o = overview();
    expect(o.headline).toBe("All 3 airports operating normally");
    expect(o.showAllNormal).toBe(true);
    expect(o.latestEventAt).toBeNull();
  });

  it("names affected airports and counts ground stops", () => {
    const o = overview({ airports: [{ ...airports[0]!, groundStop: { reasonText: "x" } }, ...airports.slice(1)] });
    expect(o.summary.counts.ground_stop).toBe(1);
    expect(o.affected.map((a) => [a.airportId, a.kind])).toEqual([["ATL", "ground_stop"]]);
    expect(o.showAllNormal).toBe(false);
  });

  it("marks an airport recovering with time since end and the estimate", () => {
    const events = [
      { type: "GROUND_STOP_ENDED", airportId: "LAX", occurredAt: "2026-01-02T10:00:00.000Z" },
      { type: "GROUND_STOP_STARTED", airportId: "LAX", occurredAt: "2026-01-02T09:00:00.000Z" },
    ];
    const o = overview({ events });
    const lax = o.affected[0]!;
    expect(lax.kind).toBe("recovering");
    expect(lax.sinceText).toBe("Ended 2 h ago");
    expect(lax.estimateText).toContain("AeroBrief estimate");
    expect(lax.estimateText).toContain("30 min to 1 h 30 min");
    expect(lax.estimateText).toContain("not an FAA figure");
    expect(o.latestEventAt).toBe("2026-01-02T10:00:00.000Z");
  });

  it("lets an active ground stop win over a recent end", () => {
    const events = [{ type: "GROUND_STOP_ENDED", airportId: "ATL", occurredAt: "2026-01-02T10:00:00.000Z" }];
    const o = overview({ airports: [{ ...airports[0]!, groundStop: {} }, ...airports.slice(1)], events });
    expect(o.affected[0]?.kind).toBe("ground_stop");
  });

  it("never says operating normally when stale", () => {
    const o = overview({ stale: true });
    expect(o.outdated).toBe(true);
    expect(o.showAllNormal).toBe(false);
    expect(o.headline).toContain("outdated");
    expect(o.headline).not.toContain("operating normally");
  });

  it("marks every airport Data Unavailable with no data", () => {
    const o = overview({ hasData: false });
    expect(o.summary.counts.data_unavailable).toBe(3);
    expect(o.headline).toBe("Data Unavailable for all 3 airports");
    expect(o.showAllNormal).toBe(false);
  });

  it("ignores events older than the recovery period as normal", () => {
    const events = [{ type: "GROUND_STOP_ENDED", airportId: "ORD", occurredAt: "2026-01-01T11:00:00.000Z" }];
    expect(overview({ events }).showAllNormal).toBe(true);
  });
});

describe("formatters", () => {
  it("formats time since end", () => {
    expect(formatSinceEnd(30_000)).toBe("Ended less than 1 min ago");
    expect(formatSinceEnd(12 * 60_000)).toBe("Ended 12 min ago");
    expect(formatSinceEnd(125 * 60_000)).toBe("Ended 2 h 5 min ago");
  });

  it("formats the estimate range with its label and basis", () => {
    expect(formatEstimate([30, 90])).toBe(
      "AeroBrief estimate: back to normal in about 30 min to 1 h 30 min (based on how long the ground stop lasted; not an FAA figure)",
    );
  });
});
