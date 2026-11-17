import { createLogger, type Logger } from "@aerobrief/core";
import { createDb, createRepositories, type Repositories } from "@aerobrief/db";
import { parseEnv, type Env } from "./env";

const MAX_DETAIL_CHARS = 200;

/** The repository methods the cleanup job uses. */
export type CleanupRepositories = {
  cleanup: Repositories["cleanup"];
  jobRuns: Pick<Repositories["jobRuns"], "recordFailure">;
};

export type CleanupDeps = {
  /** Builds the repositories from the validated DATABASE_URL. */
  createRepositories?: (databaseUrl: string) => CleanupRepositories;
  logger?: Logger;
  /** Clock for `finishedAt`. Defaults to the real time. */
  clock?: () => Date;
};

/**
 * Retention cleanup (Requirements 11.2, 11.4, 11.6). The repository runs one db.batch, so a
 * failure changes nothing. The failure is recorded in job_runs with job = "cleanup" (design:
 * Error Handling) and the next scheduled run (30 minutes later) retries. Never throws for runtime failures; an invalid
 * env is the one exception, as in runPoll.
 */
export async function runCleanup(env: Env, now: Date, deps: CleanupDeps = {}): Promise<void> {
  const validEnv = parseEnv(env);
  const secrets = [validEnv.DATABASE_URL, validEnv.RESEND_API_KEY, validEnv.UNSUBSCRIBE_SECRET];
  const logger = deps.logger ?? createLogger(secrets);
  const clock = deps.clock ?? (() => new Date());
  const repos = (deps.createRepositories ?? defaultRepositories)(validEnv.DATABASE_URL);

  const redact = (text: string): string => {
    let out = text;
    for (const secret of secrets) if (secret.length > 0) out = out.split(secret).join("[REDACTED]");
    return out;
  };

  try {
    await repos.cleanup(now);
  } catch (err) {
    const name = err instanceof Error ? err.name : "Error";
    const message = err instanceof Error ? err.message : String(err);
    const detail = redact(`${name}: ${message}`);
    logger.error("cleanup_failed", { error: err });
    try {
      await repos.jobRuns.recordFailure(
        "storage",
        detail.length > MAX_DETAIL_CHARS ? `${detail.slice(0, MAX_DETAIL_CHARS)}…` : detail,
        now,
        clock(),
        "cleanup",
      );
    } catch (recordErr) {
      logger.error("cleanup_failure_record_failed", { error: recordErr });
    }
  }
}

function defaultRepositories(databaseUrl: string): CleanupRepositories {
  return createRepositories(createDb(databaseUrl));
}
