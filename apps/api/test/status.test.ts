import { AIRPORTS, type Snapshot } from "@aerobrief/core";
import { createLogger } from "@aerobrief/core";
import { describe, expect, it, vi } from "vitest";
import { parseEnv } from "../src/env";
import { createStatusHandlers, type StatusDeps, type StatusEventRow } from "../src/handlers/status";
import { ApiError } from "../src/http";
import type { Handler, RouteContext } from "../src/router";

const NOW = new Date("2025-01-02T12:00:00.000Z");
const env = parseEnv({
  DATABASE_URL: "postgresql://user:pw@host.neon.tech/db?sslmode=require",
  RESEND_API_KEY: "re_secret_value",
  UNSUBSCRIBE_SECRET: "unsub_secret_value",
  FRONTEND_URL: "https://app.example.com",
  MAIL_FROM: "AeroBrief <alerts@example.com>",
});

function snapshot(capturedAt: string, stopped: readonly string[] = []): Snapshot {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    capturedAt,
    airports: AIRPORTS.map((a) => ({
      airportId: a.id,
      groundStop: stopped.includes(a.id)
        ? { faaEventId: `faa-${a.id}`, idSource: "faa_id" as const, reason: "wind", center: null, endTime: null, expectedEnd: null, advisoryUrl: null }
        : null,
    })),
  };
}

function ctx(params: Record<string, string> = {}, query = ""): RouteContext {
  return {
    params,
    session: null,
    now: NOW,
    body: undefined,
    url: new URL(`https://api.example.com/x${query}`),
    signal: new AbortController().signal,
    logger: createLogger([]),
  };
}

function event(type: string, airportId: string | null, occurredAt: string): StatusEventRow {
  return { type, airportId, occurredAt: new Date(occurredAt), explanation: `text for ${type}` };
}

function setup(snap: Snapshot | null, events: readonly StatusEventRow[] = []) {
  const latestSnapshot = vi.fn(async (_now: Date): Promise<Snapshot | null> => snap);
  const recentEvents = vi.fn(
    async (_now: Date, _airportId?: string): Promise<readonly StatusEventRow[]> => events,
  );
  const deps: StatusDeps = { latestSnapshot, recentEvents };
  return { handlers: createStatusHandlers(deps), latestSnapshot, recentEvents };
}

async function call(h: Handler, c: RouteContext): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await h(new Request("https://api.example.com/x"), env, c);
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

// ZTL, ZBW, ZNY, ZDC: ATL, BOS, JFK/EWR, DCA
const secondsAgo = (s: number): string => new Date(NOW.getTime() - s * 1000).toISOString();

describe("health", () => {
  it("returns ok without touching repositories", async () => {
    const { handlers, latestSnapshot, recentEvents } = setup(null);
    const r = await call(handlers.health, ctx());
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ status: "ok" });
    expect(latestSnapshot.mock.calls).toHaveLength(0);
    expect(recentEvents.mock.calls).toHaveLength(0);
  });
});

describe("national status", () => {
  it("returns no_data with no stale field when there is no Snapshot", async () => {
    const { handlers } = setup(null);
    const r = await call(handlers.national, ctx());
    expect(r.status).toBe(200);
    expect(r.json["state"]).toBe("no_data");
    expect("stale" in r.json).toBe(false);
    expect("airports" in r.json).toBe(false);
  });

  it("lists all 20 airports with translated ground stop text", async () => {
    const { handlers, latestSnapshot } = setup(snapshot(secondsAgo(30), ["JFK"]), [
      event("GROUND_STOP_STARTED", "JFK", secondsAgo(60)),
    ]);
    const r = await call(handlers.national, ctx());
    const airports = r.json["airports"] as { airportId: string; groundStop: { reasonText: string } | null }[];
    expect(airports).toHaveLength(20);
    const jfk = airports.find((a) => a.airportId === "JFK");
    expect(jfk?.groundStop?.reasonText).toContain("strong winds");
    expect(airports.filter((a) => a.groundStop !== null)).toHaveLength(1);
    expect(r.json["events"]).toEqual([
      { type: "GROUND_STOP_STARTED", airportId: "JFK", occurredAt: secondsAgo(60), explanation: "text for GROUND_STOP_STARTED" },
    ]);
    expect(latestSnapshot.mock.calls[0]?.[0]).toEqual(NOW);
  });

  it("is stale at 601 s and not stale at 600 s", async () => {
    const fresh = await call(setup(snapshot(secondsAgo(600))).handlers.national, ctx());
    const old = await call(setup(snapshot(secondsAgo(601))).handlers.national, ctx());
    expect(fresh.json["stale"]).toBe(false);
    expect(old.json["stale"]).toBe(true);
  });

  it("nationwide is active with 3 ARTCCs and has an explanation", async () => {
    const r = await call(setup(snapshot(secondsAgo(10), ["ATL", "BOS", "JFK"])).handlers.national, ctx());
    const n = r.json["nationwide"] as { active: boolean; count: number; artccs: string[]; explanation: string | null };
    expect(n.active).toBe(true);
    expect(n.count).toBe(3);
    expect(n.artccs).toEqual(["ZBW", "ZNY", "ZTL"]);
    expect(n.explanation).toContain("3 of the FAA's regional air traffic control centers");
  });

  it("nationwide is inactive with 2 ARTCCs (same-center airports count once) and explanation is null", async () => {
    const r = await call(setup(snapshot(secondsAgo(10), ["ATL", "JFK", "EWR"])).handlers.national, ctx());
    const n = r.json["nationwide"] as { active: boolean; count: number; explanation: string | null };
    expect(n.active).toBe(false);
    expect(n.count).toBe(2);
    expect(n.explanation).toBeNull();
  });
});

describe("airport status", () => {
  it("throws a 404 ApiError for an unknown code and does not read the database", async () => {
    const { handlers, latestSnapshot } = setup(snapshot(secondsAgo(10)));
    await expect(call(handlers.airport, ctx({ code: "XXX" }))).rejects.toMatchObject({
      status: 404,
      code: "airport_not_found",
    });
    await expect(call(handlers.airport, ctx({ code: "XXX" }))).rejects.toBeInstanceOf(ApiError);
    expect(latestSnapshot.mock.calls).toHaveLength(0);
  });

  it("returns no_data with no stale field when there is no Snapshot", async () => {
    const r = await call(setup(null).handlers.airport, ctx({ code: "JFK" }));
    expect(r.json["state"]).toBe("no_data");
    expect("stale" in r.json).toBe(false);
  });

  it("returns the airport, stale flag and its events", async () => {
    const { handlers, recentEvents } = setup(snapshot(secondsAgo(601), ["JFK"]), [
      event("GROUND_STOP_STARTED", "JFK", secondsAgo(700)),
    ]);
    const r = await call(handlers.airport, ctx({ code: "jfk" }));
    const airport = r.json["airport"] as { airportId: string; groundStop: unknown };
    expect(airport.airportId).toBe("JFK");
    expect(airport.groundStop).not.toBeNull();
    expect(r.json["stale"]).toBe(true);
    expect(r.json["events"]).toHaveLength(1);
    expect(recentEvents.mock.calls[0]?.[1]).toBe("JFK");
  });

  it("propagates repository failures so the router can answer 503", async () => {
    const deps: StatusDeps = {
      latestSnapshot: vi.fn(async (_now: Date): Promise<Snapshot | null> => {
        throw new Error("db down");
      }),
      recentEvents: vi.fn(async (_now: Date, _a?: string): Promise<readonly StatusEventRow[]> => []),
    };
    await expect(call(createStatusHandlers(deps).airport, ctx({ code: "JFK" }))).rejects.toThrow("db down");
  });
});

describe("history", () => {
  const events = [
    event("GROUND_STOP_ENDED", "JFK", secondsAgo(100)),
    event("GROUND_STOP_STARTED", "JFK", secondsAgo(7200)),
    event("GROUND_STOP_STARTED", "JFK", secondsAgo(23 * 3600)),
  ];

  it("returns 404 for an unknown code", async () => {
    await expect(call(setup(null, events).handlers.history, ctx({ code: "ZZZ" }))).rejects.toMatchObject({ status: 404 });
  });

  it("returns newest first with no since", async () => {
    const r = await call(setup(null, events).handlers.history, ctx({ code: "JFK" }));
    const list = r.json["events"] as { occurredAt: string }[];
    expect(r.json["airportId"]).toBe("JFK");
    expect(list.map((e) => e.occurredAt)).toEqual([secondsAgo(100), secondsAgo(7200), secondsAgo(23 * 3600)]);
  });

  it("filters by a recent since", async () => {
    const q = `?since=${encodeURIComponent(secondsAgo(3600))}`;
    const r = await call(setup(null, events).handlers.history, ctx({ code: "JFK" }, q));
    expect(r.json["events"]).toHaveLength(1);
  });

  it("clamps a since older than 24 h", async () => {
    const stale = event("GROUND_STOP_STARTED", "JFK", secondsAgo(25 * 3600));
    const q = `?since=${encodeURIComponent("2020-01-01T00:00:00Z")}`;
    const r = await call(setup(null, [...events, stale]).handlers.history, ctx({ code: "JFK" }, q));
    expect(r.json["events"]).toHaveLength(3);
  });

  it("rejects an unparseable since with 400", async () => {
    await expect(
      call(setup(null, events).handlers.history, ctx({ code: "JFK" }, "?since=notadate")),
    ).rejects.toMatchObject({ status: 400, code: "invalid_since" });
  });
});

describe("ground stop expectedEnd and advisoryUrl (Requirements 17.1, 17.4, 17.5)", () => {
  type Stop = { reasonText: string; expectedEnd: string | null; advisoryUrl: string | null };

  function withStop(extra: Record<string, unknown>): Snapshot {
    const snap = snapshot(secondsAgo(30), ["JFK"]);
    const jfk = snap.airports.find((a) => a.airportId === "JFK");
    if (jfk?.groundStop == null) throw new Error("fixture");
    // Fixture override: lets tests simulate old snapshots and unsafe URLs.
    jfk.groundStop = { ...jfk.groundStop, ...extra } as typeof jfk.groundStop;
    return snap;
  }

  async function stops(snap: Snapshot): Promise<{ national: Stop | null; airport: Stop | null }> {
    const { handlers } = setup(snap);
    const n = await call(handlers.national, ctx());
    const a = await call(handlers.airport, ctx({ code: "JFK" }));
    const list = n.json["airports"] as { airportId: string; groundStop: Stop | null }[];
    return {
      national: list.find((x) => x.airportId === "JFK")?.groundStop ?? null,
      airport: (a.json["airport"] as { groundStop: Stop | null }).groundStop,
    };
  }

  it("returns expectedEnd and a safe advisoryUrl on both endpoints", async () => {
    const r = await stops(withStop({ expectedEnd: "2025-01-02T14:00:00.000Z", advisoryUrl: "https://www.fly.faa.gov/adv" }));
    for (const s of [r.national, r.airport]) {
      expect(s?.expectedEnd).toBe("2025-01-02T14:00:00.000Z");
      expect(s?.advisoryUrl).toBe("https://www.fly.faa.gov/adv");
    }
  });

  it("returns null for both when absent (old snapshot)", async () => {
    const snap = withStop({});
    const jfk = snap.airports.find((a) => a.airportId === "JFK");
    if (jfk?.groundStop == null) throw new Error("fixture");
    const legacy: Record<string, unknown> = { ...jfk.groundStop };
    delete legacy["expectedEnd"];
    delete legacy["advisoryUrl"];
    jfk.groundStop = legacy as unknown as typeof jfk.groundStop;
    const r = await stops(snap);
    for (const s of [r.national, r.airport]) {
      expect(s?.expectedEnd).toBeNull();
      expect(s?.advisoryUrl).toBeNull();
    }
  });

  it("nulls an unsafe advisoryUrl", async () => {
    const r = await stops(withStop({ advisoryUrl: "javascript:alert(1)" }));
    expect(r.national?.advisoryUrl).toBeNull();
    expect(r.airport?.advisoryUrl).toBeNull();
  });
});
