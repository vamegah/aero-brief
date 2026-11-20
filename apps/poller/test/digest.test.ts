import { createLogger, digestClaimKey, STALE_NOTICE, verifyDigestUnsubscribe } from "@aerobrief/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  candidateDigestDates,
  NOT_ALLOWLISTED,
  runDigest,
  type DigestFetch,
  type DigestRepositories,
} from "../src/digest";
import type { Env } from "../src/env";

const NOW = new Date("2026-11-14T07:30:00.000Z");
const DATE = "2026-11-14";
const SECRET = "unsub_secret_value";

const baseEnv = {
  DATABASE_URL: "postgres://user:dbpass@db.example.com/app",
  RESEND_API_KEY: "re_secret_value",
  UNSUBSCRIBE_SECRET: SECRET,
  FRONTEND_URL: "https://app.example.com",
  MAIL_FROM: "AeroBrief <alerts@example.com>",
  FEATURE_DIGESTS: "true",
  SAFE_SEND_MODE: "false",
} satisfies Env;

type Fake = { userId: string; email: string; hour?: number };

function setup(
  opts: {
    users?: Fake[];
    preClaimed?: string[];
    capturedAt?: string | null;
    sendResults?: (Response | Error)[];
    claimThrowsFor?: string;
  } = {},
) {
  const users = opts.users ?? [{ userId: "u1", email: "u1@example.com" }];
  const claims = new Set<string>(opts.preClaimed ?? []);
  const lines: string[] = [];
  const push = (l: string) => void lines.push(l);
  const logger = createLogger([], { debug: push, info: push, warn: push, error: push });
  const results = [...(opts.sendResults ?? [])];
  const fetchFn = vi.fn<DigestFetch>(async () => {
    const next = results.shift() ?? new Response("{}", { status: 200 });
    if (next instanceof Error) throw next;
    return next;
  });
  const sleeps: number[] = [];
  const completed: { userId: string; status: string; attempts: number; skipReason?: string | null }[] = [];

  const repos = {
    snapshots: {
      latestSnapshot: vi.fn(async () =>
        opts.capturedAt === null
          ? null
          : {
              id: "s",
              capturedAt: opts.capturedAt ?? NOW.toISOString(),
              airports: [{ airportId: "JFK" as const, groundStop: null }],
            },
      ),
    },
    events: {
      recentEvents: vi.fn(async () => [
        {
          type: "GROUND_STOP_STARTED",
          airportId: "JFK",
          occurredAt: new Date("2026-11-14T05:00:00.000Z"),
          explanation: "Explained ground stop at JFK.",
        },
      ]),
    },
    subscriptions: {
      usersWithWatchlist: vi.fn(async () => users.map((u) => ({ userId: u.userId, email: u.email }))),
      list: vi.fn(async () => [{ airportId: "JFK" }]),
    },
    digest: {
      loadDueInputs: vi.fn(async () => ({
        prefs: users.map((u) => ({
          userId: u.userId,
          enabled: true,
          hour: u.hour ?? 7,
          updatedAt: new Date("2026-11-01T00:00:00.000Z"),
        })),
        watchlistCounts: new Map(users.map((u) => [u.userId, 1])),
        claimedKeys: new Set([...claims].map((k) => k.replace("/", "|"))),
      })),
      claim: vi.fn(async (userId: string, digestDate: string) => {
        if (opts.claimThrowsFor === userId) throw new Error("db down");
        const k = `${userId}/${digestDate}`;
        if (claims.has(k)) return false;
        claims.add(k);
        return true;
      }),
      complete: vi.fn(async (i: { userId: string; status: string; attempts: number; skipReason?: string | null }) => {
        completed.push(i);
      }),
    },
  } satisfies DigestRepositories;

  const deps = {
    createRepositories: vi.fn(() => repos),
    fetchFn,
    sleep: async (ms: number) => void sleeps.push(ms),
    clock: () => NOW,
    logger,
  };
  return { repos, deps, fetchFn, sleeps, completed, lines, claims };
}

const sentBody = (fetchFn: ReturnType<typeof setup>["fetchFn"], call = 0) =>
  JSON.parse(fetchFn.mock.calls[call]?.[1].body as string) as { to: string; subject: string; text: string; html: string };

afterEach(() => vi.restoreAllMocks());

describe("candidateDigestDates", () => {
  it("covers the previous UTC date for a run just after midnight", () => {
    expect(candidateDigestDates(new Date("2026-11-14T01:10:00.000Z"))).toEqual(["2026-11-14", "2026-11-13"]);
  });
});

describe("runDigest outer failure log", () => {
  it("logs the stage, message and cause message when loadDueInputs throws", async () => {
    const s = setup();
    s.repos.digest.loadDueInputs.mockRejectedValueOnce(new Error("boom", { cause: new Error("cert fail") }));
    await runDigest(baseEnv, NOW, s.deps);

    const entry = JSON.parse(s.lines.find((l) => l.includes("digest_run_failed")) as string) as {
      fields: Record<string, unknown>;
    };
    expect(entry.fields).toMatchObject({
      stage: "loadDueInputs",
      errorName: "Error",
      errorMessage: "boom",
      causeName: "Error",
      causeMessage: "cert fail",
    });
  });

  it("does not log the DATABASE_URL when it appears in the message or cause", async () => {
    const s = setup();
    const lines: string[] = [];
    const push = (l: string) => void lines.push(l);
    const logger = createLogger([baseEnv.DATABASE_URL, baseEnv.RESEND_API_KEY, baseEnv.UNSUBSCRIBE_SECRET], {
      debug: push,
      info: push,
      warn: push,
      error: push,
    });
    s.repos.digest.loadDueInputs.mockRejectedValueOnce(
      new Error(`connect failed for ${baseEnv.DATABASE_URL}`, { cause: `bad ${baseEnv.DATABASE_URL}` }),
    );
    await runDigest(baseEnv, NOW, { ...s.deps, logger });

    const out = lines.join("\n");
    expect(out).toContain("digest_run_failed");
    expect(out).not.toContain(baseEnv.DATABASE_URL);
    expect(out).not.toContain("dbpass");
  });
});

describe("runDigest", () => {
  it("makes no database, Resend or fetch call when the flag is off", async () => {
    const s = setup();
    const globalFetch = vi.spyOn(globalThis, "fetch");
    const summary = await runDigest({ ...baseEnv, FEATURE_DIGESTS: "false" }, NOW, s.deps);
    expect(summary.skippedReason).toBe("flag_off");
    expect(s.deps.createRepositories).not.toHaveBeenCalled();
    expect(s.repos.digest.loadDueInputs).not.toHaveBeenCalled();
    expect(s.fetchFn).not.toHaveBeenCalled();
    expect(globalFetch).not.toHaveBeenCalled();
  });

  it("sends one digest with the subject, the idempotency key and no List-Unsubscribe header", async () => {
    const s = setup();
    const summary = await runDigest(baseEnv, NOW, s.deps);

    expect(s.fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = s.fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    const headers = init.headers as Record<string, string>;
    expect(headers["Idempotency-Key"]).toBe(`digest/u1/${DATE}`);
    expect(Object.keys(headers).map((h) => h.toLowerCase())).not.toContain("list-unsubscribe");
    const body = sentBody(s.fetchFn);
    expect(body.to).toBe("u1@example.com");
    expect(body.subject).toBe("AeroBrief daily digest: 1 disruption");
    expect(body.text).toContain("Explained ground stop at JFK.");
    expect(body.text).not.toContain(STALE_NOTICE);

    // The unsubscribe link carries a signature made with the current secret.
    const link = new URL(/https:\/\/app\.example\.com\/digest\/unsubscribe\?\S+/.exec(body.text)?.[0] ?? "");
    expect(link.searchParams.get("u")).toBe("u1");
    expect(await verifyDigestUnsubscribe("u1", link.searchParams.get("s") ?? "", [SECRET])).toBe(true);

    expect(s.completed).toEqual([{ userId: "u1", digestDate: DATE, status: "handed_off", attempts: 1, skipReason: null }]);
    expect(summary).toMatchObject({ due: 1, claimed: 1, handedOff: 1 });
  });

  it("sends nothing for a digest that is already claimed", async () => {
    const s = setup({ preClaimed: [`u1/${DATE}`] });
    await runDigest(baseEnv, NOW, s.deps);
    expect(s.fetchFn).not.toHaveBeenCalled();
    expect(s.repos.digest.claim).not.toHaveBeenCalled();
  });

  it("sends nothing on a second run for the same date when the claim store rejects", async () => {
    const s = setup();
    await runDigest(baseEnv, NOW, s.deps);
    expect(s.fetchFn).toHaveBeenCalledTimes(1);
    // Simulate a racing run that did not see the claim in loadDueInputs.
    s.repos.digest.loadDueInputs.mockImplementationOnce(async () => ({
      prefs: [{ userId: "u1", enabled: true, hour: 7, updatedAt: new Date("2026-11-01T00:00:00.000Z") }],
      watchlistCounts: new Map([["u1", 1]]),
      claimedKeys: new Set<string>(),
    }));
    const second = await runDigest(baseEnv, NOW, s.deps);
    expect(s.repos.digest.claim).toHaveBeenCalledTimes(2);
    expect(s.fetchFn).toHaveBeenCalledTimes(1);
    expect(second.claimed).toBe(0);
    expect(digestClaimKey("u1", DATE)).toBe("u1|2026-11-14");
  });

  it("records a skipped row with not_allowlisted and sends nothing under Safe_Send_Mode", async () => {
    const s = setup();
    await runDigest({ ...baseEnv, SAFE_SEND_MODE: undefined, SAFE_SEND_ALLOWLIST_EMAILS: "other@example.com" }, NOW, s.deps);
    expect(s.fetchFn).not.toHaveBeenCalled();
    expect(s.completed).toEqual([
      { userId: "u1", digestDate: DATE, status: "skipped", attempts: 0, skipReason: NOT_ALLOWLISTED },
    ]);
  });

  it("sends to an allowlisted address under Safe_Send_Mode", async () => {
    const s = setup({ users: [{ userId: "u1", email: "Delivered@Resend.dev" }] });
    await runDigest({ ...baseEnv, SAFE_SEND_MODE: undefined }, NOW, s.deps);
    expect(s.fetchFn).toHaveBeenCalledTimes(1);
  });

  it("retries after one rejection and records handed_off with 2 attempts and a 1 second wait", async () => {
    const s = setup({ sendResults: [new Response("no", { status: 500 })] });
    await runDigest(baseEnv, NOW, s.deps);
    expect(s.fetchFn).toHaveBeenCalledTimes(2);
    expect(s.sleeps).toEqual([1000]);
    expect(s.completed[0]).toMatchObject({ status: "handed_off", attempts: 2 });
    const keys = s.fetchFn.mock.calls.map((c) => (c[1].headers as Record<string, string>)["Idempotency-Key"]);
    expect(new Set(keys)).toEqual(new Set([`digest/u1/${DATE}`]));
  });

  it("records failed after 3 rejections, waits 1 then 3 seconds, and keeps the claim", async () => {
    const s = setup({
      sendResults: [
        new Response("", { status: 500 }),
        new DOMException("timed out", "TimeoutError"),
        new Response("", { status: 429 }),
      ],
    });
    const summary = await runDigest(baseEnv, NOW, s.deps);
    expect(s.fetchFn).toHaveBeenCalledTimes(3);
    expect(s.sleeps).toEqual([1000, 3000]);
    expect(s.completed[0]).toMatchObject({ status: "failed", attempts: 3 });
    expect(s.claims.has(`u1/${DATE}`)).toBe(true);
    expect(summary.failed).toBe(1);
  });

  it("logs a per-user error without the email address and goes on to the next user", async () => {
    const s = setup({
      users: [
        { userId: "u1", email: "first@example.com" },
        { userId: "u2", email: "second@example.com" },
      ],
      claimThrowsFor: "u1",
    });
    const summary = await runDigest(baseEnv, NOW, s.deps);
    expect(summary.errored).toBe(1);
    expect(s.fetchFn).toHaveBeenCalledTimes(1);
    expect(sentBody(s.fetchFn).to).toBe("second@example.com");
    const log = s.lines.join("\n");
    expect(log).toContain("digest_user_failed");
    expect(log).toContain("u1");
    expect(log).not.toContain("example.com");
  });

  it("adds the stale notice when the latest snapshot is older than 10 minutes", async () => {
    const s = setup({ capturedAt: "2026-11-14T06:00:00.000Z" });
    await runDigest(baseEnv, NOW, s.deps);
    const body = sentBody(s.fetchFn);
    expect(body.text).toContain(STALE_NOTICE);
    expect(body.html).toContain(STALE_NOTICE);
  });
});
