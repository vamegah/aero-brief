import {
  airportById,
  composeDigest,
  createLogger,
  filterAllowlisted,
  isMonitoredId,
  isSafeSendMode,
  parseEmailAllowlist,
  selectDigestContent,
  selectDueDigests,
  signDigestUnsubscribe,
  type DigestAirport,
  type DigestEvent,
  type DigestEventType,
  type DigestPrefRow,
  type DueDigest,
  type Logger,
  type Snapshot,
} from "@aerobrief/core";
import { createDb, createRepositories, type DigestDueInputs } from "@aerobrief/db";
import { RESEND_EMAILS_URL, SEND_TIMEOUT_MS } from "@aerobrief/mail";
import type { Env } from "./env";
import { readFlags } from "./features";

/** Recorded in digest_deliveries.skip_reason for a Safe_Send_Mode skip (Requirement 5.6). */
export const NOT_ALLOWLISTED = "not_allowlisted";

/** Total sends per digest: the first try plus 2 retries (Requirement 11.6). */
export const DIGEST_MAX_ATTEMPTS = 3;

/** Waits before attempt 2 and attempt 3 (design: Digest retry waits). */
export const DIGEST_RETRY_WAITS_MS: readonly number[] = [1_000, 3_000];

const HOUR_MS = 3_600_000;
const CATCH_UP_HOURS = 3;

type DigestStoredEvent = { type: string; airportId: string | null; occurredAt: Date; explanation: string };

/** The slice of the repositories that runDigest uses. Structural, so tests pass plain fakes. */
export type DigestRepositories = {
  snapshots: { latestSnapshot(now: Date): Promise<Snapshot | null> };
  events: { recentEvents(now: Date): PromiseLike<DigestStoredEvent[]> };
  subscriptions: {
    usersWithWatchlist(): PromiseLike<{ userId: string; email: string }[]>;
    list(userId: string): PromiseLike<{ airportId: string }[]>;
  };
  digest: {
    loadDueInputs(candidateDates: readonly string[]): Promise<DigestDueInputs>;
    claim(userId: string, digestDate: string, now: Date): Promise<boolean>;
    complete(
      input: {
        userId: string;
        digestDate: string;
        status: "handed_off" | "failed" | "skipped";
        attempts: number;
        skipReason?: string | null;
      },
      now: Date,
    ): Promise<void>;
  };
};

export type DigestFetch = (url: string, init: RequestInit) => Promise<Response>;

export type DigestDeps = {
  /** Builds the repositories from DATABASE_URL. Called only after the flag gate has passed. */
  createRepositories?: (databaseUrl: string) => DigestRepositories;
  fetchFn?: DigestFetch;
  /** Retry wait. Injectable so tests use fake timers or an instant sleep. */
  sleep?: (ms: number) => Promise<void>;
  clock?: () => Date;
  logger?: Logger;
};

export type DigestSummary = {
  /** Why nothing was attempted, or null when the run proceeded. */
  skippedReason: "flag_off" | null;
  due: number;
  claimed: number;
  handedOff: number;
  failed: number;
  skipped: number;
  /** Users whose processing threw. */
  errored: number;
};

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const defaultFetch: DigestFetch = (url, init) => fetch(url, init);

const MAX_ERROR_TEXT = 500;

/** Message of an Error, or a safe string form of any other value, cut to 500 characters. */
function describeError(value: unknown): string {
  let text: string;
  try {
    text = value instanceof Error ? value.message : typeof value === "string" ? value : String(value);
  } catch {
    text = "unprintable";
  }
  return text.slice(0, MAX_ERROR_TEXT);
}

function str(env: object, key: string): string | undefined {
  const v = (env as Record<string, unknown>)[key];
  return typeof v === "string" ? v : undefined;
}

/**
 * The UTC dates `selectDueDigests` can produce: the date of each whole hour from `now`
 * back 0..3 hours.
 */
export function candidateDigestDates(now: Date): string[] {
  const runHour = Math.floor(now.getTime() / HOUR_MS) * HOUR_MS;
  const dates = new Set<string>();
  for (let k = 0; k <= CATCH_UP_HOURS; k++) {
    dates.add(new Date(runHour - k * HOUR_MS).toISOString().slice(0, 10));
  }
  return [...dates];
}

/** Idempotency-Key sent to Resend (Requirement 11.6). */
export function digestIdempotencyKey(userId: string, digestDate: string): string {
  return `digest/${userId}/${digestDate}`;
}

/**
 * Hourly digest run (Requirements 1.5, 5.4, 5.6, 5.7, 11.1, 11.2, 11.5, 11.6, 11.10, 11.11, 11.13, 12.9).
 * Returns before any database, Resend or other outbound call when `digests` is off.
 * Never throws: a failure for one User is logged by user id and date, and the loop continues.
 */
export async function runDigest(env: Env, now: Date, deps: DigestDeps = {}): Promise<DigestSummary> {
  const summary: DigestSummary = {
    skippedReason: null,
    due: 0,
    claimed: 0,
    handedOff: 0,
    failed: 0,
    skipped: 0,
    errored: 0,
  };
  const logger = deps.logger ?? createLogger([env.DATABASE_URL, env.RESEND_API_KEY, env.UNSUBSCRIBE_SECRET]);
  let stage = "flags";
  try {
    // Flag gate first, so a flag-off run makes no query and no request (Requirement 1.5).
    if (!readFlags(env, logger).FEATURE_DIGESTS) return { ...summary, skippedReason: "flag_off" };

    const clock = deps.clock ?? (() => new Date());
    const sleep = deps.sleep ?? defaultSleep;
    const fetchFn = deps.fetchFn ?? defaultFetch;
    stage = "createRepositories";
    const repos = (deps.createRepositories ?? defaultRepositories)(env.DATABASE_URL);

    stage = "loadDueInputs";
    const inputs = await repos.digest.loadDueInputs(candidateDigestDates(now));
    const due = selectDueDigests({
      now,
      prefs: inputs.prefs as readonly DigestPrefRow[],
      claimedKeys: inputs.claimedKeys,
      watchlistCounts: inputs.watchlistCounts,
    });
    summary.due = due.length;
    if (due.length === 0) return summary;

    // Read once per run: addresses, the last 24 hours of Events and the latest Snapshot.
    stage = "usersWithWatchlist";
    const emails = new Map((await repos.subscriptions.usersWithWatchlist()).map((u) => [u.userId, u.email]));
    stage = "recentEvents";
    const recent = await repos.events.recentEvents(now);
    stage = "latestSnapshot";
    const snapshot = await repos.snapshots.latestSnapshot(now);

    const safeSend = isSafeSendMode(str(env, "SAFE_SEND_MODE"));
    const allowlist = parseEmailAllowlist(str(env, "SAFE_SEND_ALLOWLIST_EMAILS"));
    // Links are signed with the current secret only. The previous one is accepted for verification, never for signing.
    const signingSecret = env.UNSUBSCRIBE_SECRET;

    for (const item of due) {
      try {
        const outcome = await processUser({
          env,
          item,
          now,
          clock,
          sleep,
          fetchFn,
          repos,
          logger,
          emails,
          recent,
          snapshot,
          safeSend,
          allowlist,
          signingSecret,
        });
        if (outcome === "not_claimed") continue;
        summary.claimed++;
        if (outcome === "handed_off") summary.handedOff++;
        else if (outcome === "failed") summary.failed++;
        else summary.skipped++;
      } catch (err) {
        // Requirement 11.13: log by user id and date only, then go on. A claimed row stays in place.
        summary.errored++;
        logger.error("digest_user_failed", {
          userId: item.userId,
          digestDate: item.digestDate,
          errorName: err instanceof Error ? err.name : "unknown",
        });
      }
    }
    return summary;
  } catch (err) {
    // The logger redacts the configured secrets (DATABASE_URL included) as substrings of every field value.
    const fields: Record<string, unknown> = {
      stage,
      errorName: err instanceof Error ? err.name : "unknown",
      errorMessage: describeError(err),
    };
    const cause = err instanceof Error ? err.cause : undefined;
    if (cause !== undefined && cause !== null) {
      fields["causeName"] = cause instanceof Error ? cause.name : typeof cause;
      fields["causeMessage"] = describeError(cause);
    }
    logger.error("digest_run_failed", fields);
    return summary;
  }
}

type UserContext = {
  env: Env;
  item: DueDigest;
  now: Date;
  clock: () => Date;
  sleep: (ms: number) => Promise<void>;
  fetchFn: DigestFetch;
  repos: DigestRepositories;
  logger: Logger;
  emails: ReadonlyMap<string, string>;
  recent: readonly DigestStoredEvent[];
  snapshot: Snapshot | null;
  safeSend: boolean;
  allowlist: readonly string[];
  signingSecret: string;
};

type UserOutcome = "not_claimed" | "handed_off" | "failed" | "skipped";

async function processUser(ctx: UserContext): Promise<UserOutcome> {
  const { repos, logger, clock, item } = ctx;
  const { userId, digestDate } = item;

  // Requirement 11.5: one claim per User and date. No row back means another run owns it.
  if (!(await repos.digest.claim(userId, digestDate, clock()))) return "not_claimed";

  const finish = async (
    status: "handed_off" | "failed" | "skipped",
    attempts: number,
    skipReason?: string,
  ): Promise<UserOutcome> => {
    await repos.digest.complete(
      { userId, digestDate, status, attempts, skipReason: skipReason ?? null },
      clock(),
    );
    logger.info("digest_outcome", { userId, digestDate, status, attempts });
    return status;
  };

  const email = ctx.emails.get(userId);
  if (email === undefined) return finish("failed", 0);

  // Requirements 5.4, 5.6: under Safe_Send_Mode a recipient off the Allowlist gets no call.
  if (ctx.safeSend && filterAllowlisted([email], ctx.allowlist, (e) => e).length === 0) {
    return finish("skipped", 0, NOT_ALLOWLISTED);
  }

  const watched = await repos.subscriptions.list(userId);
  const watchedIds = watched.map((w) => w.airportId);
  const events: DigestEvent[] = selectDigestContent({
    now: ctx.now,
    events: ctx.recent.map((e) => ({
      type: e.type,
      airportId: e.airportId,
      occurredAt: e.occurredAt.toISOString(),
      explanation: e.explanation,
    })),
    watchedAirportIds: watchedIds,
  }).flatMap((e): DigestEvent[] => {
    if (e.type !== "GROUND_STOP_STARTED" && e.type !== "GROUND_STOP_ENDED" && e.type !== "NATIONWIDE_EVENT") {
      return [];
    }
    const airportName = e.airportId !== null && isMonitoredId(e.airportId) ? airportById(e.airportId).name : null;
    return [{ ...e, type: e.type as DigestEventType, airportName }];
  });

  const watchedAirports: DigestAirport[] = watchedIds.filter(isMonitoredId).map((id) => ({
    airportId: id,
    name: airportById(id).name,
    hasGroundStop:
      ctx.snapshot === null ? null : (ctx.snapshot.airports.find((a) => a.airportId === id)?.groundStop ?? null) !== null,
  }));

  const sig = await signDigestUnsubscribe(userId, ctx.signingSecret);
  const base = ctx.env.FRONTEND_URL.replace(/\/+$/, "");
  const unsubscribeUrl = `${base}/digest/unsubscribe?u=${encodeURIComponent(userId)}&s=${encodeURIComponent(sig)}`;
  const composed = composeDigest({
    digestDate,
    now: ctx.now,
    events,
    watchedAirports,
    latestSnapshotCapturedAt: ctx.snapshot?.capturedAt ?? null,
    frontendUrl: ctx.env.FRONTEND_URL,
    unsubscribeUrl,
  });

  // No List-Unsubscribe header: the signed link in the body is the only mechanism (Requirement 12.9).
  const body = JSON.stringify({ from: ctx.env.MAIL_FROM, to: email, ...composed });
  const key = digestIdempotencyKey(userId, digestDate);

  let attempts = 0;
  for (;;) {
    attempts++;
    if (await attemptSend(ctx, body, key)) return finish("handed_off", attempts);
    const wait = DIGEST_RETRY_WAITS_MS[attempts - 1];
    // A failed claim stays in place: the row is marked failed and no second send happens that date.
    if (attempts >= DIGEST_MAX_ATTEMPTS || wait === undefined) return finish("failed", attempts);
    await ctx.sleep(wait);
  }
}

/** One POST to Resend. True only for a 2xx. A rejection, network error or 10-second timeout is false. */
async function attemptSend(ctx: UserContext, body: string, idempotencyKey: string): Promise<boolean> {
  try {
    const res = await ctx.fetchFn(RESEND_EMAILS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ctx.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body,
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function defaultRepositories(databaseUrl: string): DigestRepositories {
  return createRepositories(createDb(databaseUrl));
}
