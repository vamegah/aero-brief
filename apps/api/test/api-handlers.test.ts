import { AIRPORTS, MONITORED_IDS, type Snapshot } from "@aerobrief/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createStatusHandlers, type StatusDeps, type StatusEventRow } from "../src/handlers/status";
import { createWatchlistHandlers, type WatchlistRepos } from "../src/handlers/watchlist";
import { createFetchHandler, SESSION_COOKIE, type Route, type Session } from "../src/router";

/**
 * Integration-style checks that run the real status and watchlist handlers behind the real
 * router. Per-handler cases live in status.test.ts, watchlist.test.ts, auth.test.ts,
 * router.test.ts and routes.test.ts; this file adds the cross-cutting cases only.
 */

const NOW = new Date("2025-01-02T12:00:00.000Z");
const ORIGIN = "https://app.example.com";
const rawEnv = {
  DATABASE_URL: "postgresql://user:pw@host.neon.tech/db?sslmode=require",
  RESEND_API_KEY: "re_secret_value",
  UNSUBSCRIBE_SECRET: "unsub_secret_value",
  FRONTEND_URL: ORIGIN,
  MAIL_FROM: "AeroBrief <alerts@example.com>",
};
const session: Session = { sessionId: "s1", userId: "u1", email: "a@b.co", tokenHash: "h" };

const secondsAgo = (s: number): string => new Date(NOW.getTime() - s * 1000).toISOString();

function snapshot(capturedAt: string): Snapshot {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    capturedAt,
    airports: AIRPORTS.map((a) => ({ airportId: a.id, groundStop: null })),
  };
}

function statusRoutes(deps: StatusDeps): readonly Route[] {
  const h = createStatusHandlers(deps);
  return [
    { method: "GET", pattern: "/api/status/national", auth: "none", handler: h.national },
    { method: "GET", pattern: "/api/status/airport/:code", auth: "none", handler: h.airport },
    { method: "GET", pattern: "/api/history/:code", auth: "none", handler: h.history },
  ];
}

function okDeps(snap: Snapshot | null): StatusDeps {
  return {
    latestSnapshot: vi.fn(async (_now: Date): Promise<Snapshot | null> => snap),
    recentEvents: vi.fn(async (_now: Date, _airportId?: string): Promise<readonly StatusEventRow[]> => []),
  };
}

const get = (path: string, headers: Record<string, string> = {}): Request =>
  new Request(`https://api.example.com${path}`, { headers });

afterEach(() => {
  vi.restoreAllMocks();
});

describe("status routes through the router", () => {
  it("makes zero outbound fetches on every status route", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
        throw new Error("unexpected outbound fetch");
      });
    const handler = createFetchHandler(statusRoutes(okDeps(snapshot(secondsAgo(10)))), { now: () => NOW });
    for (const path of ["/api/status/national", "/api/status/airport/JFK", "/api/history/JFK"]) {
      const res = await handler(get(path), rawEnv);
      expect(res.status).toBe(200);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns no_data in a 200 when there is no Snapshot", async () => {
    const handler = createFetchHandler(statusRoutes(okDeps(null)), { now: () => NOW });
    const res = await handler(get("/api/status/national"), rawEnv);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { state: string }).state).toBe("no_data");
  });

  it("returns 404 for an unknown airport code", async () => {
    const handler = createFetchHandler(statusRoutes(okDeps(snapshot(secondsAgo(10)))), { now: () => NOW });
    const res = await handler(get("/api/status/airport/XXX"), rawEnv);
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("airport_not_found");
  });

  it("flags stale true at 601 s and false at 600 s", async () => {
    const stale = async (age: number): Promise<boolean> => {
      const handler = createFetchHandler(statusRoutes(okDeps(snapshot(secondsAgo(age)))), { now: () => NOW });
      const res = await handler(get("/api/status/national"), rawEnv);
      return ((await res.json()) as { stale: boolean }).stale;
    };
    expect(await stale(600)).toBe(false);
    expect(await stale(601)).toBe(true);
  });

  it("answers 503 with Retry-After: 30 when a repository throws", async () => {
    const deps: StatusDeps = {
      latestSnapshot: vi.fn(async (_now: Date): Promise<Snapshot | null> => {
        throw new Error("db down");
      }),
      recentEvents: vi.fn(async (_now: Date, _airportId?: string): Promise<readonly StatusEventRow[]> => []),
    };
    const handler = createFetchHandler(statusRoutes(deps), { now: () => NOW });
    for (const path of ["/api/status/national", "/api/status/airport/JFK"]) {
      const res = await handler(get(path), rawEnv);
      expect(res.status).toBe(503);
      expect(res.headers.get("Retry-After")).toBe("30");
    }
  });
});

describe("session routes through the router", () => {
  /** A session store with one valid and one expired token; anything else is unknown. */
  const resolveSession = vi.fn(
    async (hash: string, now: Date, _signal: AbortSignal): Promise<Session | null> => {
      const store = new Map<string, Date>([
        ["valid", new Date(NOW.getTime() + 60_000)],
        ["expired", new Date(NOW.getTime() - 60_000)],
      ]);
      for (const [token, expiresAt] of store) {
        if ((await sha256(token)) === hash) return expiresAt > now ? session : null;
      }
      return null;
    },
  );

  async function sha256(text: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  function setup(initial: readonly string[] = []) {
    const stored = new Set<string>(initial);
    const add = vi.fn(async (_userId: string, airportId: string, _now: Date): Promise<boolean> => {
      const had = stored.has(airportId);
      stored.add(airportId);
      return !had;
    });
    const repos: WatchlistRepos = {
      subscriptions: {
        list: vi.fn(async (_userId: string) => [...stored].map((airportId) => ({ airportId }))),
        add,
        remove: vi.fn(async (_userId: string, airportId: string): Promise<void> => {
          stored.delete(airportId);
        }),
      },
      users: { deleteAccount: vi.fn(async (_userId: string): Promise<boolean> => true) },
    };
    const w = createWatchlistHandlers({ repos: () => repos });
    const routes: readonly Route[] = [
      { method: "GET", pattern: "/api/watchlist", auth: "session", handler: w.getWatchlist },
      { method: "POST", pattern: "/api/watchlist", auth: "session", handler: w.addToWatchlist },
    ];
    return { handler: createFetchHandler(routes, { now: () => NOW, resolveSession }), add };
  }

  const withCookie = (token: string): Request =>
    get("/api/watchlist", { Cookie: `${SESSION_COOKIE}=${token}` });

  it("returns 401 for a missing, an expired and an unknown Session", async () => {
    const { handler } = setup();
    expect((await handler(get("/api/watchlist"), rawEnv)).status).toBe(401);
    expect((await handler(withCookie("expired"), rawEnv)).status).toBe(401);
    expect((await handler(withCookie("unknown"), rawEnv)).status).toBe(401);
    expect((await handler(withCookie("valid"), rawEnv)).status).toBe(200);
  });

  const postAirport = (airportId: string): Request =>
    new Request("https://api.example.com/api/watchlist", {
      method: "POST",
      headers: { Origin: ORIGIN, "Content-Type": "application/json", Cookie: `${SESSION_COOKIE}=valid` },
      body: JSON.stringify({ airportId }),
    });

  it("POST /api/watchlist is idempotent", async () => {
    const { handler, add } = setup();
    const first = await handler(postAirport("JFK"), rawEnv);
    const second = await handler(postAirport("JFK"), rawEnv);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ watchlist: ["JFK"] });
    expect(add).toHaveBeenCalledTimes(1);
  });

  it("POST /api/watchlist returns 409 for an 11th airport", async () => {
    const { handler, add } = setup(MONITORED_IDS.slice(0, 10));
    const res = await handler(postAirport(MONITORED_IDS[10] ?? "XXX"), rawEnv);
    expect(res.status).toBe(409);
    expect(add).not.toHaveBeenCalled();
  });
});
