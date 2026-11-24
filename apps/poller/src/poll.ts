import {
  createLogger,
  detectChanges,
  eventKey,
  explain,
  normalizeResponse,
  resolveRelayConfig,
  shouldWarnUpstreamFailure,
  type Logger,
} from "@aerobrief/core";
import { createDb, createRepositories, type FailureKind, type Repositories } from "@aerobrief/db";
import { parseEnv, type Env } from "./env";
import { fetchFaa, type FetchFn } from "./faa-client";
import { notify as defaultNotify, type NotifierDeps, type NotifierRepositories, type NotifierEvent, type NotifyInput, type NotifySummary } from "./notifier";
import { sendEmail } from "@aerobrief/mail";
import { readFlags } from "./features";
import { dispatchWebhooks } from "./webhooks";

/** Lease TTL from design.md (Poller): 3 minutes. */
export const LEASE_TTL_MS = 180_000;

const MAX_DETAIL_CHARS = 200;

/** The repository methods the poll cycle uses. */
export type PollRepositories = {
  snapshots: Pick<Repositories["snapshots"], "latestSnapshot">;
  jobRuns: Pick<Repositories["jobRuns"], "recordFailure" | "latestPollRun">;
  pollerLease: Pick<Repositories["pollerLease"], "acquire" | "release">;
  storePollResult: Repositories["storePollResult"];
  subscriptions: NotifierRepositories["subscriptions"];
  alertLog: NotifierRepositories["alertLog"];
};

export type PollDeps = {
  fetchFn?: FetchFn;
  /** Builds the repositories from the validated DATABASE_URL. */
  createRepositories?: (databaseUrl: string) => PollRepositories;
  logger?: Logger;
  /** Clock for `finishedAt`. Defaults to the real time. */
  clock?: () => Date;
  /** Notifier entry point. Defaults to `notify` from ./notifier. */
  notifyFn?: (deps: NotifierDeps, input: NotifyInput) => Promise<NotifySummary>;
  sendEmailFn?: NotifierDeps["sendEmail"];
  /** Webhook dispatcher. Defaults to `dispatchWebhooks` from ./webhooks. */
  dispatchWebhooksFn?: typeof dispatchWebhooks;
};

/** Never throws, even for values with a throwing getter or a non-callable toString. */
export function describeError(err: unknown): string {
  try {
    const name = err instanceof Error ? err.name : "Error";
    const message = err instanceof Error ? err.message : String(err);
    return `${name}: ${message}`;
  } catch {
    return "Error: unknown error";
  }
}

function truncate(text: string): string {
  return text.length > MAX_DETAIL_CHARS ? `${text.slice(0, MAX_DETAIL_CHARS)}…` : text;
}

/**
 * One poll cycle (Requirements 1.1, 1.2, 1.3, 1.5, 1.6, 1.7, 2.2, 2.3, 2.7).
 * Never throws for runtime failures: they become a failed job_run or a log line.
 * An invalid env is the one exception, because nothing can run without it.
 */
export async function runPoll(env: Env, now: Date, deps: PollDeps = {}): Promise<void> {
  const validEnv = parseEnv(env);
  const secrets = [validEnv.DATABASE_URL, validEnv.RESEND_API_KEY, validEnv.UNSUBSCRIBE_SECRET];
  if (typeof env.WEBHOOK_MASTER_SECRET === "string" && env.WEBHOOK_MASTER_SECRET.length > 0) {
    secrets.push(env.WEBHOOK_MASTER_SECRET);
  }
  // Values under 8 characters are never sent (invalid config makes no request), and redacting
  // them would mangle the key names in the validation detail.
  if (typeof env.FAA_RELAY_SECRET === "string" && env.FAA_RELAY_SECRET.length >= 8) {
    secrets.push(env.FAA_RELAY_SECRET);
  }
  const logger = deps.logger ?? createLogger(secrets);
  const clock = deps.clock ?? (() => new Date());
  const repos = (deps.createRepositories ?? defaultRepositories)(validEnv.DATABASE_URL);

  const redact = (text: string): string => {
    let out = text;
    for (const secret of secrets) if (secret.length > 0) out = out.split(secret).join("[REDACTED]");
    return out;
  };

  let token: string | null;
  try {
    token = await repos.pollerLease.acquire(now, LEASE_TTL_MS);
  } catch (err) {
    // Database unreachable: nothing can be recorded. The next cron run retries.
    logger.error("poll_lease_acquire_failed", { error: err });
    return;
  }
  if (token === null) return; // Another run holds the lease (Requirement 1.7). No job_run.

  const startedAt = now;
  const fail = async (kind: FailureKind, detail: string): Promise<void> => {
    if (kind === "http_status") {
      // Read the previous run BEFORE recording this failure. A read failure never blocks the record.
      let warn = true;
      try {
        warn = shouldWarnUpstreamFailure(await repos.jobRuns.latestPollRun(), now);
      } catch (err) {
        logger.error("poll_previous_run_read_failed", { error: err });
      }
      if (warn) logger.warn("faa_upstream_non_2xx", { kind, detail: truncate(redact(detail)) });
    }
    try {
      await repos.jobRuns.recordFailure(kind, truncate(redact(detail)), startedAt, clock());
    } catch (err) {
      logger.error("poll_failure_record_failed", { kind, error: err });
    }
  };

  let inserted: Awaited<ReturnType<Repositories["storePollResult"]>> = [];
  let storedAt: Date | null = null;
  try {
    const relay = resolveRelayConfig({ url: env.FAA_RELAY_URL, secret: env.FAA_RELAY_SECRET });
    if (relay.mode === "invalid") {
      // Fail closed: no request is made, so the secret can never go to a wrong host.
      logger.error("faa_relay_config_invalid", { keys: relay.keys });
      await fail("validation", `Invalid relay settings: ${relay.keys.join(", ")}`);
      return;
    }
    const result = await fetchFaa(deps.fetchFn, relay.mode === "relay" ? { url: relay.url, secret: relay.secret } : undefined);
    if (!result.ok) {
      await fail(result.kind, result.detail);
      return;
    }
    try {
      const previous = await repos.snapshots.latestSnapshot(now);
      const snapshot = normalizeResponse(
        result.response,
        result.fetchedAt ?? now.toISOString(),
        crypto.randomUUID(),
        previous,
      );
      const detected = detectChanges(snapshot, previous);
      const newEvents = detected.map((e) => ({
        eventKey: eventKey(e, previous?.id ?? null),
        snapshotId: snapshot.id,
        type: e.type,
        airportId: e.type === "NATIONWIDE_EVENT" ? null : e.airportId,
        occurredAt: new Date(e.occurredAt),
        payload: e,
        explanation: explain(e),
      }));
      // One db.batch: Snapshot, Events (ON CONFLICT DO NOTHING RETURNING) and success job_run.
      inserted = await repos.storePollResult({ snapshot, events: newEvents, startedAt, finishedAt: clock() });
      storedAt = clock(); // Alert_Latency starts right after the commit (Requirement 12.4).
    } catch (err) {
      // The batch is one transaction, so a throw leaves no partial Snapshot (Requirement 2.7).
      await fail("storage", describeError(err));
      return;
    }

    // Notifier failures never fail the poll or undo stored data (Requirement 9.1).
    if (inserted.length > 0 && storedAt !== null) {
      try {
        await (deps.notifyFn ?? defaultNotify)(
          {
            repos: { snapshots: repos.snapshots, subscriptions: repos.subscriptions, alertLog: repos.alertLog },
            sendEmail: deps.sendEmailFn ?? sendEmail,
            clock,
            logger,
            config: {
              resendApiKey: validEnv.RESEND_API_KEY,
              unsubscribeSecret: validEnv.UNSUBSCRIBE_SECRET,
              frontendUrl: validEnv.FRONTEND_URL,
              from: validEnv.MAIL_FROM,
            },
          },
          { events: inserted satisfies readonly NotifierEvent[], storedAt },
        );
      } catch (err) {
        logger.error("poll_notify_failed", { error: err });
      }

      // Webhooks run after notify() returns and only while the flag is on (Requirements 16.1, 16.14).
      // With the flag off there is no webhook query and no fetch.
      if (readFlags(env, logger).FEATURE_WEBHOOKS) {
        try {
          await (deps.dispatchWebhooksFn ?? dispatchWebhooks)(env, inserted, storedAt, { logger, clock });
        } catch (err) {
          logger.error("poll_webhooks_failed", { error: err });
        }
      }
    }
  } finally {
    try {
      await repos.pollerLease.release(token, now);
    } catch (err) {
      logger.error("poll_lease_release_failed", { error: err });
    }
  }
}

function defaultRepositories(databaseUrl: string): PollRepositories {
  return createRepositories(createDb(databaseUrl));
}
