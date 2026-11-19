// Flags-off guard for webhooks in the Poller. With FEATURE_WEBHOOKS off, a poll cycle must not
// call the dispatcher, touch any webhook repository, or fetch anything beyond the FAA request,
// and notify() must behave exactly as it does without the webhook code path.
// Validates Requirements 1.6, 3.1, 3.2.
import { createLogger } from "@aerobrief/core";
import type { SendEmailOptions, SendEmailResult } from "@aerobrief/mail";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../src/env";
import { FAA_API_URL, type FetchFn } from "../src/faa-client";
import { notify, type NotifierEvent, type NotifierRepositories } from "../src/notifier";
import { runPoll, type PollDeps, type PollRepositories } from "../src/poll";

const baseEnv: Env = {
  DATABASE_URL: "postgresql://user:pass@host.neon.tech/db",
  RESEND_API_KEY: "re_secret_value",
  UNSUBSCRIBE_SECRET: "unsub_secret_value",
  FRONTEND_URL: "https://aerobrief.example.com",
  MAIL_FROM: "AeroBrief <alerts@example.com>",
};
const now = new Date("2025-01-02T12:00:00.000Z");
const clock = () => now;
const okBody = JSON.stringify([{ airportId: "JFK", airportLongName: "John F Kennedy", groundStop: null }]);

const gsEvent: NotifierEvent = {
  id: "e1",
  eventKey: "faa:1",
  type: "GROUND_STOP_STARTED",
  airportId: "JFK",
  occurredAt: now,
  explanation: "Ground stop at JFK.",
};
const watchers = [{ userId: "u1", email: "a@x.com" }];

const KNOWN_REPO_KEYS = new Set(["snapshots", "jobRuns", "pollerLease", "storePollResult", "subscriptions", "alertLog"]);

function makeRepos() {
  return {
    snapshots: { latestSnapshot: vi.fn(async () => ({ id: "s", capturedAt: now.toISOString(), airports: [] })) },
    jobRuns: { recordFailure: vi.fn(async () => undefined) },
    pollerLease: { acquire: vi.fn(async () => "token"), release: vi.fn(async () => undefined) },
    storePollResult: vi.fn(async (_input: unknown): Promise<unknown[]> => [gsEvent]),
    subscriptions: {
      watchersOfAirport: vi.fn(async () => watchers),
      usersWithWatchlist: vi.fn(async () => []),
    },
    alertLog: {
      claim: vi.fn(async (rows: readonly { eventId: string; eventKey: string; eventType: string; userId: string }[]) =>
        rows.map((r) => ({ ...r, id: `claim-${r.eventKey}-${r.userId}` })),
      ),
      recordOutcome: vi.fn(async () => undefined),
      recordLatency: vi.fn(async () => undefined),
    },
  };
}

const silentLogger = () => {
  const noop = () => undefined;
  return createLogger([], { debug: noop, info: noop, warn: noop, error: noop });
};
const okSend = async (_opts: SendEmailOptions): Promise<SendEmailResult> => ({ ok: true, id: "r1", attempts: 1, idempotencyKey: "k" });

afterEach(() => vi.restoreAllMocks());

describe("webhooks flags-off guard (poller)", () => {
  const envs: Array<[string, Env]> = [
    ["no flags set", baseEnv],
    ["FEATURE_WEBHOOKS=false", { ...baseEnv, FEATURE_WEBHOOKS: "false" } as Env],
    ["FEATURE_WEBHOOKS invalid", { ...baseEnv, FEATURE_WEBHOOKS: "yes" } as Env],
  ];

  for (const [label, env] of envs) {
    it(`makes no webhook call and leaves notify() unchanged: ${label}`, async () => {
      // Reference run: notify() called directly, as if the webhook path did not exist.
      const ref = makeRepos();
      const refSend = vi.fn(okSend);
      const config = {
        resendApiKey: baseEnv.RESEND_API_KEY,
        unsubscribeSecret: baseEnv.UNSUBSCRIBE_SECRET,
        frontendUrl: baseEnv.FRONTEND_URL,
        from: baseEnv.MAIL_FROM,
      };
      const refSummary = await notify(
        { repos: ref as unknown as NotifierRepositories, sendEmail: refSend, clock, logger: silentLogger(), config },
        { events: [gsEvent], storedAt: now },
      );

      // Poll run with every flag off.
      const repos = makeRepos();
      const touched: string[] = [];
      const guarded = new Proxy(repos, {
        get(target, prop, receiver) {
          if (typeof prop === "string" && !KNOWN_REPO_KEYS.has(prop)) touched.push(prop);
          return Reflect.get(target, prop, receiver);
        },
      });
      const sendEmailFn = vi.fn(okSend);
      const dispatchWebhooksFn = vi.fn(async () => undefined);
      const fetchFn = vi.fn<FetchFn>(async () => new Response(okBody, { status: 200 }));
      const globalFetch = vi.spyOn(globalThis, "fetch");
      const notifyFn = vi.fn(notify);
      const outcomes: unknown[] = [];
      notifyFn.mockImplementation(async (d, i) => {
        const out = await notify(d, i);
        outcomes.push(out);
        return out;
      });

      await runPoll(env, now, {
        fetchFn,
        createRepositories: () => guarded as unknown as PollRepositories,
        logger: silentLogger(),
        clock,
        notifyFn,
        sendEmailFn,
        dispatchWebhooksFn: dispatchWebhooksFn as unknown as NonNullable<PollDeps["dispatchWebhooksFn"]>,
      });

      // No webhook work at all.
      expect(dispatchWebhooksFn).not.toHaveBeenCalled();
      expect(touched).toEqual([]);
      expect(globalFetch).not.toHaveBeenCalled();
      // Only the FAA fetch.
      expect(fetchFn).toHaveBeenCalledTimes(1);
      expect(String(fetchFn.mock.calls[0]![0])).toBe(FAA_API_URL);

      // notify() output and effects equal the reference run.
      expect(outcomes).toEqual([refSummary]);
      expect(refSummary).toMatchObject({ skippedStale: false, claimed: 1, handedOff: 1, failed: 0 });
      expect(sendEmailFn).toHaveBeenCalledTimes(1);
      // Compare data fields only: the options may also carry function members.
      const data = (o: SendEmailOptions) => JSON.parse(JSON.stringify(o)) as unknown;
      expect(data(sendEmailFn.mock.calls[0]![0])).toEqual(data(refSend.mock.calls[0]![0]));
      expect(repos.alertLog.claim.mock.calls).toEqual(ref.alertLog.claim.mock.calls);
      expect(repos.alertLog.recordOutcome.mock.calls).toEqual(ref.alertLog.recordOutcome.mock.calls);
    });
  }
});
