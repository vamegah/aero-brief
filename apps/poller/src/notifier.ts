import {
  airportById,
  composeAlertEmail,
  isMonitoredId,
  isStale,
  signUnsubscribe,
  type AlertEmailInput,
  type Logger,
} from "@aerobrief/core";
import type { Repositories } from "@aerobrief/db";
import type { SendEmailOptions, SendEmailResult } from "@aerobrief/mail";

/** Alert fan-out concurrency (design: Notifier). */
export const SEND_CONCURRENCY = 10;

/** Recorded in alert_log.error when a retry is cancelled because the data went stale. */
export const STALE_ABORT_ERROR = "stale_snapshot";

/** A newly inserted Event, as returned by the events repository. */
export type NotifierEvent = {
  id: string;
  eventKey: string;
  type: string;
  airportId: string | null;
  occurredAt: Date;
  explanation: string;
};

export type NotifierRepositories = {
  snapshots: Pick<Repositories["snapshots"], "latestSnapshot">;
  subscriptions: Pick<Repositories["subscriptions"], "watchersOfAirport" | "usersWithWatchlist">;
  alertLog: Pick<Repositories["alertLog"], "claim" | "recordOutcome" | "recordLatency">;
};

/** Secrets and addresses come from the env that apps/poller passes in; core never reads env. */
export type NotifierConfig = {
  resendApiKey: string;
  unsubscribeSecret: string;
  frontendUrl: string;
  from: string;
};

export type NotifierDeps = {
  repos: NotifierRepositories;
  sendEmail: (opts: SendEmailOptions) => Promise<SendEmailResult>;
  clock: () => Date;
  logger: Logger;
  config: NotifierConfig;
  concurrency?: number;
};

export type NotifyInput = {
  events: readonly NotifierEvent[];
  /** Set right after the Snapshot batch commits; the start of Alert_Latency. */
  storedAt: Date;
};

export type NotifySummary = {
  skippedStale: boolean;
  claimed: number;
  handedOff: number;
  failed: number;
};

type Recipient = { userId: string; email: string };
type Job = { event: NotifierEvent; recipient: Recipient; claimId: string };

const ALERT_TYPES = new Set(["GROUND_STOP_STARTED", "GROUND_STOP_ENDED", "NATIONWIDE_EVENT"]);

const claimKey = (eventKey: string, eventType: string, userId: string): string =>
  JSON.stringify([eventKey, eventType, userId]);

/**
 * Sends alert emails for newly inserted Events (Requirements 6.8, 9.1, 9.4-9.7, 9.9, 9.10, 12.4, 12.5, 12.7).
 * Never throws for runtime failures; they are logged and recorded per alert.
 */
export async function notify(deps: NotifierDeps, input: NotifyInput): Promise<NotifySummary> {
  const { repos, logger, clock } = deps;
  const summary: NotifySummary = { skippedStale: false, claimed: 0, handedOff: 0, failed: 0 };
  if (input.events.length === 0) return summary;

  // Requirement 6.8: no sends while the latest stored Snapshot is stale or missing.
  const dataIsStale = async (): Promise<boolean> => {
    try {
      const now = clock();
      const latest = await repos.snapshots.latestSnapshot(now);
      return latest === null || isStale(latest.capturedAt, now);
    } catch (err) {
      logger.error("notifier_staleness_check_failed", { error: err });
      return true; // fail safe: do not send on unknown freshness
    }
  };

  if (await dataIsStale()) {
    summary.skippedStale = true;
    return summary;
  }

  // Recipient selection (Requirements 9.1, 9.6, 9.7). Users with zero airports never match.
  const recipientsByEvent = new Map<NotifierEvent, Recipient[]>();
  let nationwide: Recipient[] | null = null;
  for (const event of input.events) {
    if (!ALERT_TYPES.has(event.type)) {
      logger.warn("notifier_unsupported_event_type", { eventKey: event.eventKey, type: event.type });
      continue;
    }
    try {
      if (event.type === "NATIONWIDE_EVENT") {
        nationwide ??= await repos.subscriptions.usersWithWatchlist();
        recipientsByEvent.set(event, nationwide);
      } else if (event.airportId !== null) {
        recipientsByEvent.set(event, await repos.subscriptions.watchersOfAirport(event.airportId));
      }
    } catch (err) {
      logger.error("notifier_recipient_selection_failed", { eventKey: event.eventKey, error: err });
    }
  }

  // One bulk claim; only newly claimed rows are sent (Requirements 9.4, 9.10).
  const claims = [...recipientsByEvent].flatMap(([event, recipients]) =>
    recipients.map((r) => ({
      eventId: event.id,
      eventKey: event.eventKey,
      eventType: event.type,
      userId: r.userId,
      snapshotStoredAt: input.storedAt,
    })),
  );
  if (claims.length === 0) return summary;

  let claimed;
  try {
    claimed = await repos.alertLog.claim(claims, clock());
  } catch (err) {
    logger.error("notifier_claim_failed", { error: err });
    return summary;
  }
  summary.claimed = claimed.length;

  const claimIds = new Map(claimed.map((c) => [claimKey(c.eventKey, c.eventType, c.userId), c.id]));
  const jobs: Job[] = [];
  for (const [event, recipients] of recipientsByEvent) {
    for (const recipient of recipients) {
      const claimId = claimIds.get(claimKey(event.eventKey, event.type, recipient.userId));
      if (claimId !== undefined) jobs.push({ event, recipient, claimId });
    }
  }

  const runJob = async (job: Job): Promise<void> => {
    const outcome = await deliver(deps, job, input.storedAt, dataIsStale);
    if (outcome === "handed_off") summary.handedOff++;
    else summary.failed++;
  };

  await runPool(jobs, deps.concurrency ?? SEND_CONCURRENCY, runJob);
  return summary;
}

function buildEmail(
  event: NotifierEvent,
  recipientId: string,
  frontendUrl: string,
  sig: string | null,
): AlertEmailInput | null {
  const occurredAt = event.occurredAt.toISOString();
  if (event.type === "NATIONWIDE_EVENT") {
    return { eventType: "NATIONWIDE_EVENT", explanation: event.explanation, occurredAt };
  }
  if (event.airportId === null || !isMonitoredId(event.airportId) || sig === null) return null;
  return {
    eventType: event.type as "GROUND_STOP_STARTED" | "GROUND_STOP_ENDED",
    airportName: airportById(event.airportId).name,
    explanation: event.explanation,
    occurredAt,
    unsubscribe: { frontendUrl, userId: recipientId, airportId: event.airportId, sig },
  };
}

async function deliver(
  deps: NotifierDeps,
  job: Job,
  storedAt: Date,
  dataIsStale: () => Promise<boolean>,
): Promise<"handed_off" | "failed"> {
  const { repos, logger, clock, config } = deps;
  const { event, recipient, claimId } = job;
  let aborted = false;

  const record = async (outcome: Parameters<typeof repos.alertLog.recordOutcome>[1]) => {
    try {
      await repos.alertLog.recordOutcome(claimId, outcome);
    } catch (err) {
      logger.error("alert_outcome_record_failed", { eventKey: event.eventKey, error: err });
    }
  };
  const fail = async (attempts: number, error: string): Promise<"failed"> => {
    await record({ status: "failed", attempts, completedAt: clock(), error });
    return "failed";
  };

  let result: SendEmailResult;
  try {
    const sig =
      event.type === "NATIONWIDE_EVENT" || event.airportId === null
        ? null
        : await signUnsubscribe(config.unsubscribeSecret, recipient.userId, event.airportId);
    const email = buildEmail(event, recipient.userId, config.frontendUrl, sig);
    if (email === null) return await fail(0, "invalid_event");
    const composed = composeAlertEmail(email);
    result = await deps.sendEmail({
      apiKey: config.resendApiKey,
      message: { from: config.from, to: recipient.email, ...composed },
      idempotency: { eventKey: event.eventKey, eventType: event.type, userId: recipient.userId },
      // Re-check staleness before each retry (Requirement 6.8).
      shouldRetry: async () => {
        if (await dataIsStale()) {
          aborted = true;
          return false;
        }
        return true;
      },
    });
  } catch (err) {
    logger.error("alert_send_threw", { eventKey: event.eventKey, error: err });
    return fail(0, "send_error");
  }

  if (!result.ok) return fail(result.attempts, aborted ? STALE_ABORT_ERROR : result.error);

  // acceptedAt is when Resend accepted the email (Requirement 12.4).
  const acceptedAt = clock();
  await record({ status: "handed_off", attempts: result.attempts, completedAt: acceptedAt });
  try {
    await repos.alertLog.recordLatency(claimId, acceptedAt.getTime() - storedAt.getTime());
  } catch (err) {
    // Requirement 12.7: the email result stays; only the latency is lost.
    logger.error("latency_record_failed", {
      event: "latency_record_failed",
      eventKey: event.eventKey,
      eventType: event.type,
      userId: recipient.userId,
      error: err,
    });
  }
  return "handed_off";
}

async function runPool<T>(items: readonly T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const item = items[next++] as T;
      await fn(item);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
}
