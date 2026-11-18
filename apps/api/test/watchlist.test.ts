import { MONITORED_IDS, signUnsubscribe } from "@aerobrief/core";
import { SubscriptionLimitError } from "@aerobrief/db";
import { describe, expect, it, vi } from "vitest";
import type { Env } from "../src/env";
import { createWatchlistHandlers, type WatchlistRepos } from "../src/handlers/watchlist";
import { ApiError } from "../src/http";
import type { Handler, RouteContext, Session } from "../src/router";

const env: Env = {
  DATABASE_URL: "postgresql://user:pw@host.neon.tech/db",
  RESEND_API_KEY: "re_key",
  UNSUBSCRIBE_SECRET: "unsub_secret_value",
  FRONTEND_URL: "https://app.example.com",
  MAIL_FROM: "AeroBrief <alerts@example.com>",
};
const NOW = new Date("2025-01-02T12:00:00.000Z");
const session: Session = { sessionId: "s1", userId: "u1", email: "a@b.co", tokenHash: "h" };

type Mocks = {
  list: ReturnType<typeof vi.fn<(userId: string) => Promise<readonly { airportId: string }[]>>>;
  add: ReturnType<typeof vi.fn<(userId: string, airportId: string, now: Date) => Promise<boolean>>>;
  remove: ReturnType<typeof vi.fn<(userId: string, airportId: string) => Promise<void>>>;
  deleteAccount: ReturnType<typeof vi.fn<(userId: string) => Promise<boolean>>>;
};

function setup(initial: readonly string[] = []) {
  const stored = new Set<string>(initial);
  const mocks: Mocks = {
    list: vi.fn(async (_userId: string) => [...stored].map((airportId) => ({ airportId }))),
    add: vi.fn(async (_userId: string, airportId: string, _now: Date) => {
      const had = stored.has(airportId);
      stored.add(airportId);
      return !had;
    }),
    remove: vi.fn(async (_userId: string, airportId: string) => {
      stored.delete(airportId);
    }),
    deleteAccount: vi.fn(async (_userId: string) => true),
  };
  const repos: WatchlistRepos = {
    subscriptions: { list: mocks.list, add: mocks.add, remove: mocks.remove },
    users: { deleteAccount: mocks.deleteAccount },
  };
  const handlers = createWatchlistHandlers({ repos: () => repos });
  return { handlers, mocks, stored };
}

function ctxOf(over: Partial<RouteContext> = {}): RouteContext {
  return {
    params: {},
    session,
    now: NOW,
    body: undefined,
    url: new URL("https://api.example.com/api/x"),
    signal: new AbortController().signal,
    logger: {
      debug: () => undefined,
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    },
    ...over,
  };
}

const req = new Request("https://api.example.com/api/x");

function call(handler: Handler, over: Partial<RouteContext> = {}): Promise<Response> {
  return handler(req, env, ctxOf(over));
}

async function apiErrorOf(p: Promise<Response>): Promise<ApiError> {
  try {
    await p;
  } catch (err) {
    if (err instanceof ApiError) return err;
    throw err;
  }
  throw new Error("expected ApiError");
}

describe("GET /api/watchlist", () => {
  it("returns the sorted watchlist", async () => {
    const { handlers } = setup(["JFK", "ATL"]);
    const res = await call(handlers.getWatchlist);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ watchlist: ["ATL", "JFK"] });
  });

  it("throws 401 without a session", async () => {
    const { handlers } = setup();
    const err = await apiErrorOf(call(handlers.getWatchlist, { session: null }));
    expect(err.status).toBe(401);
  });
});

describe("POST /api/watchlist", () => {
  it("adds an airport and returns 200", async () => {
    const { handlers, mocks } = setup(["ATL"]);
    const res = await call(handlers.addToWatchlist, { body: { airportId: "JFK" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ watchlist: ["ATL", "JFK"] });
    expect(mocks.add.mock.calls[0]).toEqual(["u1", "JFK", NOW]);
  });

  it("is idempotent for an airport already present and does not write", async () => {
    const { handlers, mocks } = setup(["ATL"]);
    const res = await call(handlers.addToWatchlist, { body: { airportId: "ATL" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ watchlist: ["ATL"] });
    expect(mocks.add).not.toHaveBeenCalled();
  });

  it("returns 200 when re-adding a present airport on a full list", async () => {
    const full = MONITORED_IDS.slice(0, 10);
    const { handlers } = setup(full);
    const res = await call(handlers.addToWatchlist, { body: { airportId: full[0] } });
    expect(res.status).toBe(200);
  });

  it("throws 409 for an 11th airport", async () => {
    const full = MONITORED_IDS.slice(0, 10);
    const eleventh = MONITORED_IDS[10];
    const { handlers, mocks } = setup(full);
    const err = await apiErrorOf(call(handlers.addToWatchlist, { body: { airportId: eleventh } }));
    expect(err.status).toBe(409);
    expect(mocks.add).not.toHaveBeenCalled();
  });

  it("maps the database cap error to 409", async () => {
    const { handlers, mocks } = setup([]);
    mocks.add.mockRejectedValueOnce(new SubscriptionLimitError());
    const err = await apiErrorOf(call(handlers.addToWatchlist, { body: { airportId: "ATL" } }));
    expect(err.status).toBe(409);
  });

  it("rethrows other repository errors", async () => {
    const { handlers, mocks } = setup([]);
    mocks.add.mockRejectedValueOnce(new Error("db down"));
    await expect(call(handlers.addToWatchlist, { body: { airportId: "ATL" } })).rejects.toThrow("db down");
  });

  it("throws 400 for an unmonitored airport", async () => {
    const { handlers } = setup();
    const err = await apiErrorOf(call(handlers.addToWatchlist, { body: { airportId: "XXX" } }));
    expect(err.status).toBe(400);
  });

  it("throws 400 for a malformed body", async () => {
    const { handlers } = setup();
    const err = await apiErrorOf(call(handlers.addToWatchlist, { body: { airportId: 5 } }));
    expect(err.status).toBe(400);
  });
});

describe("DELETE /api/watchlist/:code", () => {
  it("removes an airport", async () => {
    const { handlers, mocks } = setup(["ATL", "JFK"]);
    const res = await call(handlers.removeFromWatchlist, { params: { code: "ATL" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ watchlist: ["JFK"] });
    expect(mocks.remove.mock.calls[0]).toEqual(["u1", "ATL"]);
  });

  it("is idempotent for an absent airport", async () => {
    const { handlers } = setup(["JFK"]);
    const res = await call(handlers.removeFromWatchlist, { params: { code: "ATL" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ watchlist: ["JFK"] });
  });

  it("throws 404 for an unknown code", async () => {
    const { handlers } = setup();
    const err = await apiErrorOf(call(handlers.removeFromWatchlist, { params: { code: "XXX" } }));
    expect(err.status).toBe(404);
  });
});

describe("DELETE /api/account", () => {
  it("deletes the user once and clears the session cookie", async () => {
    const { handlers, mocks } = setup();
    const res = await call(handlers.deleteAccount);
    expect(res.status).toBe(200);
    expect(mocks.deleteAccount.mock.calls).toEqual([["u1"]]);
    const cookie = res.headers.get("Set-Cookie") ?? "";
    expect(cookie).toContain("Max-Age=0");
    expect(cookie).toContain("HttpOnly");
  });

  it("throws 401 without a session", async () => {
    const { handlers, mocks } = setup();
    const err = await apiErrorOf(call(handlers.deleteAccount, { session: null }));
    expect(err.status).toBe(401);
    expect(mocks.deleteAccount).not.toHaveBeenCalled();
  });
});

describe("POST /api/unsubscribe", () => {
  it("removes the airport and returns its name for a valid signature", async () => {
    const { handlers, mocks } = setup(["ATL"]);
    const sig = await signUnsubscribe(env.UNSUBSCRIBE_SECRET, "u9", "ATL");
    const res = await call(handlers.unsubscribe, { session: null, body: { userId: "u9", airportId: "ATL", sig } });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { airportId: string; airportName: string };
    expect(json.airportId).toBe("ATL");
    expect(json.airportName).toContain("Atlanta");
    expect(mocks.remove.mock.calls[0]).toEqual(["u9", "ATL"]);
  });

  it("throws 403 for a bad signature and does not remove", async () => {
    const { handlers, mocks } = setup(["ATL"]);
    const sig = await signUnsubscribe(env.UNSUBSCRIBE_SECRET, "u9", "JFK");
    const err = await apiErrorOf(
      call(handlers.unsubscribe, { session: null, body: { userId: "u9", airportId: "ATL", sig } }),
    );
    expect(err.status).toBe(403);
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("throws 400 for a malformed body", async () => {
    const { handlers } = setup();
    const err = await apiErrorOf(call(handlers.unsubscribe, { session: null, body: { userId: "u9" } }));
    expect(err.status).toBe(400);
  });
});

describe("POST /api/unsubscribe with a previous secret", () => {
  const PREVIOUS = "previous_secret_value";
  const FUTURE = "2025-01-03T00:00:00Z";
  const PAST = "2025-01-01T00:00:00Z";

  async function unsubscribeWith(over: Partial<Env>): Promise<{ status: number; removed: boolean }> {
    const { handlers, mocks } = setup(["ATL"]);
    const sig = await signUnsubscribe(PREVIOUS, "u9", "ATL");
    try {
      const res = await handlers.unsubscribe(req, { ...env, ...over }, ctxOf({ session: null, body: { userId: "u9", airportId: "ATL", sig } }));
      return { status: res.status, removed: mocks.remove.mock.calls.length > 0 };
    } catch (err) {
      if (err instanceof ApiError) return { status: err.status, removed: mocks.remove.mock.calls.length > 0 };
      throw err;
    }
  }

  it("accepts a link signed with the previous secret before expiry", async () => {
    const r = await unsubscribeWith({ UNSUBSCRIBE_SECRET_PREVIOUS: PREVIOUS, UNSUBSCRIBE_SECRET_PREVIOUS_EXPIRES_AT: FUTURE });
    expect(r).toEqual({ status: 200, removed: true });
  });

  it("rejects it after expiry", async () => {
    const r = await unsubscribeWith({ UNSUBSCRIBE_SECRET_PREVIOUS: PREVIOUS, UNSUBSCRIBE_SECRET_PREVIOUS_EXPIRES_AT: PAST });
    expect(r).toEqual({ status: 403, removed: false });
  });

  it("rejects it when the expiry is missing", async () => {
    const r = await unsubscribeWith({ UNSUBSCRIBE_SECRET_PREVIOUS: PREVIOUS });
    expect(r).toEqual({ status: 403, removed: false });
  });
});
