// The rotation orchestrator. All external effects go through `RotationDeps`, so the whole flow
// is testable with fakes. Nothing here reads files, env or the network, and nothing here logs a
// secret: every line passes through `redact`, which masks every secret value the run knows.
import type { Target } from "./args.ts";
import {
  connectionUserMatches,
  encodePassword,
  getConnectionPassword,
  replaceConnectionPassword,
} from "./connection-string.ts";
import { validateInputs } from "./inputs.ts";
import { buildPlan } from "./plan.ts";

export type WorkerName = "api" | "poller";

export interface RotationDeps {
  now(): Date;
  /** A fresh random secret (32 random bytes, base64url, in production). */
  randomSecret(): string;
  log(line: string): void;
  /** Throws when wrangler is not usable. No secrets involved. */
  whoami(): Promise<void>;
  /** Resets the role password and returns the new password. */
  neonResetPassword(): Promise<string>;
  /** Resolves when GET /api/status/national answers 200 with state ok or no_data (with retries). */
  verifyNationalStatus(): Promise<void>;
  /** Pipes `value` to `wrangler secret put <name>` through stdin in the Worker's directory. */
  putWorkerSecret(worker: WorkerName, name: string, value: string): Promise<void>;
  resendResolveDomainId(): Promise<string>;
  resendCreateKey(name: string, domainId: string): Promise<{ id: string; token: string }>;
  /** Sends one email to delivered@resend.dev using the given key. */
  resendSendTestEmail(token: string): Promise<void>;
  resendDeleteKey(id: string): Promise<void>;
  /** Backs up and atomically rewrites the local env file with these key/value updates. */
  writeEnv(updates: Readonly<Record<string, string>>): Promise<void>;
}

export interface RotationOptions {
  targets: readonly Target[];
  dryRun: boolean;
  confirmApiDeployed: boolean;
  /** Parsed contents of the local env file. */
  envValues: Readonly<Record<string, string>>;
}

export interface RotationResult {
  outcome: "dry-run" | "success" | "failed";
  completedSteps: string[];
  failedStep: string | null;
  /** Failure message with every known secret masked. */
  error: string | null;
  /** Secrets that changed somewhere (Neon, a Worker or .env). Names only. */
  changed: string[];
  /** Selected targets that did not finish. */
  notRotated: Target[];
  /** Worker secret names updated, per Worker. */
  workerSecrets: Record<WorkerName, string[]>;
  /** Keys written to the local env file. */
  envKeysWritten: string[];
  followUps: string[];
}

const DB_URL_KEYS = ["RUNTIME_DATABASE_URL", "DATABASE_URL", "DATABASE_URL_UNPOOLED", "TEST_DATABASE_URL"] as const;
/** The Workers' DATABASE_URL secret comes from the first of these that uses the rotated role. */
const WORKER_URL_KEYS = ["RUNTIME_DATABASE_URL", "DATABASE_URL"] as const;
export const PREVIOUS_SECRET_DAYS = 30;

/** Which .env connection strings use the role, and which of them feeds the Workers. */
export function findRoleUrls(
  env: Readonly<Record<string, string>>,
  role: string,
): { keys: string[]; workerKey: string | null } {
  const keys = DB_URL_KEYS.filter((k) => {
    const v = env[k];
    return v !== undefined && connectionUserMatches(v, role);
  });
  const workerKey = WORKER_URL_KEYS.find((k) => keys.includes(k)) ?? null;
  return { keys, workerKey };
}

export function redactSecrets(text: string, secrets: Iterable<string>): string {
  const list = [...secrets].filter((s) => s !== "").sort((a, b) => b.length - a.length);
  let out = text;
  for (const s of list) out = out.split(s).join("[redacted]");
  return out;
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : "Unknown error";
}

export async function runRotation(deps: RotationDeps, options: RotationOptions): Promise<RotationResult> {
  const secrets = new Set<string>();
  const addSecret = (s: string | undefined): void => {
    if (s !== undefined && s !== "") secrets.add(s);
  };
  const env = options.envValues;
  for (const k of ["NEON_API_KEY", "RESEND_ADMIN_API_KEY", "RESEND_API_KEY", "UNSUBSCRIBE_SECRET"]) addSecret(env[k]);
  for (const k of DB_URL_KEYS) {
    const url = env[k];
    if (url === undefined) continue;
    addSecret(url);
    const pw = getConnectionPassword(url);
    if (pw !== null && pw !== "") {
      addSecret(pw);
      addSecret(encodePassword(pw));
    }
  }
  const say = (line: string): void => deps.log(redactSecrets(line, secrets));

  const updates: Record<string, string> = {};
  const completed: string[] = [];
  const changed = new Set<string>();
  const doneTargets = new Set<Target>();
  const workerSecrets: Record<WorkerName, string[]> = { api: [], poller: [] };
  const followUps: string[] = [];
  const result = (outcome: RotationResult["outcome"], failedStep: string | null, error: string | null, envKeysWritten: string[]): RotationResult => ({
    outcome,
    completedSteps: [...completed],
    failedStep,
    error,
    changed: [...changed],
    notRotated: options.targets.filter((t) => !doneTargets.has(t)),
    workerSecrets,
    envKeysWritten,
    followUps,
  });

  const plan = buildPlan({ targets: options.targets, dryRun: options.dryRun });
  say(options.dryRun ? "Dry run: nothing will be changed. Planned steps:" : "Planned steps:");
  plan.steps.forEach((s, i) => say(`  ${i + 1}. ${s.description}`));
  if (options.targets.includes("unsubscribe")) {
    say("Reminder: the API with dual-secret unsubscribe support (task 19.1) must be deployed before rotating the unsubscribe secret.");
  }
  if (options.dryRun) return result("dry-run", null, null, []);

  // Runs one step. Returns false after recording the failure, so callers can stop at once.
  let failedStep: string | null = null;
  let failure: string | null = null;
  const step = async (id: string, fn: () => Promise<void>): Promise<boolean> => {
    say(`> ${id}`);
    try {
      await fn();
      completed.push(id);
      return true;
    } catch (e) {
      failedStep = id;
      failure = redactSecrets(messageOf(e), secrets);
      return false;
    }
  };
  const put = async (worker: WorkerName, name: string, value: string): Promise<void> => {
    await deps.putWorkerSecret(worker, name, value);
    workerSecrets[worker].push(name);
  };

  const finish = async (): Promise<RotationResult> => {
    let written: string[] = [];
    let writeFailed = false;
    if (Object.keys(updates).length > 0) {
      const id = "local:write-env";
      say(`> ${id}`);
      try {
        await deps.writeEnv(updates);
        completed.push(id);
        written = Object.keys(updates);
      } catch (e) {
        writeFailed = true;
        failedStep ??= id;
        failure ??= redactSecrets(messageOf(e), secrets);
        followUps.push("The local .env could not be updated. The new values were NOT saved locally; the Workers hold the new values. Rotate the affected secret again to regain a local copy.");
      }
    }
    const failedNow = failedStep !== null || writeFailed;
    if (written.length > 0) {
      followUps.push("Delete .env.backup once you have confirmed the service works; it holds the previous secret values.");
    }
    const res = result(failedNow ? "failed" : "success", failedStep, failure, written);
    for (const line of formatReport(res)) say(line);
    return res;
  };

  // ---- Preflight ----
  say("> preflight");
  const checked = validateInputs(env, options.targets);
  if (!checked.ok) {
    failedStep = "preflight";
    failure = `Missing or invalid variables: ${checked.invalid.join(", ")}`;
    return finish();
  }
  const neonRole = checked.inputs.neon?.NEON_ROLE_NAME;
  const roleUrls = neonRole === undefined ? null : findRoleUrls(env, neonRole);
  if (roleUrls !== null && roleUrls.workerKey === null) {
    failedStep = "preflight";
    failure = "Neither RUNTIME_DATABASE_URL nor DATABASE_URL uses NEON_ROLE_NAME, so the Workers' DATABASE_URL would not change. Set NEON_ROLE_NAME to the role the Workers use.";
    return finish();
  }
  if (options.targets.includes("unsubscribe") && !options.confirmApiDeployed) {
    failedStep = "preflight";
    failure = "Rotating the unsubscribe secret needs the API with previous-secret support deployed. Re-run with --confirm-api-deployed once it is.";
    return finish();
  }
  if (!(await step("preflight:wrangler-whoami", () => deps.whoami()))) return finish();
  completed.push("preflight");

  // ---- Neon ----
  const neon = checked.inputs.neon;
  if (neon !== undefined && roleUrls !== null && roleUrls.workerKey !== null) {
    let workerUrl = "";
    if (!(await step("neon:reset-password", async () => {
      const password = await deps.neonResetPassword();
      addSecret(password);
      addSecret(encodePassword(password));
      for (const key of roleUrls.keys) updates[key] = replaceConnectionPassword(env[key]!, password);
      workerUrl = updates[roleUrls.workerKey!]!;
      addSecret(workerUrl);
      changed.add("Neon role password");
    }))) {
      followUps.push("The Neon request failed. If it failed after being sent, the role password may have changed; if the app stops working, reset the password in the Neon console and update DATABASE_URL on both Workers.");
      return finish();
    }
    for (const worker of ["api", "poller"] as const) {
      if (!(await step(`neon:put-DATABASE_URL:${worker}`, () => put(worker, "DATABASE_URL", workerUrl)))) {
        followUps.push("The Neon password is already reset. Set DATABASE_URL on each Worker that was not updated (values are in the local .env).");
        return finish();
      }
    }
    if (!(await step("neon:verify-status", () => deps.verifyNationalStatus()))) return finish();
    doneTargets.add("neon");
    followUps.push("Update any other copy of the rotated connection string outside .env and the Workers (for example CI or Vercel settings).");
  }

  // ---- Resend ----
  const resend = checked.inputs.resend;
  if (resend !== undefined) {
    const keyName = `aerobrief-runtime-${deps.now().toISOString().slice(0, 10)}`;
    let created: { id: string; token: string } | null = null;
    if (!(await step("resend:create-key", async () => {
      const domainId = await deps.resendResolveDomainId();
      const key = await deps.resendCreateKey(keyName, domainId);
      addSecret(key.token);
      created = key;
    }))) {
      return finish();
    }
    const newKey = created as unknown as { id: string; token: string };
    for (const worker of ["api", "poller"] as const) {
      if (!(await step(`resend:put-RESEND_API_KEY:${worker}`, async () => {
        await put(worker, "RESEND_API_KEY", newKey.token);
        updates["RESEND_API_KEY"] = newKey.token;
        changed.add("RESEND_API_KEY");
      }))) {
        followUps.push(`A new Resend key named ${keyName} was created. The old key was NOT deleted. Delete the new key in the Resend dashboard if it is unused.`);
        return finish();
      }
    }
    if (!(await step("resend:verify-send", () => deps.resendSendTestEmail(newKey.token)))) {
      followUps.push(`The new Resend key (${keyName}) is on the Workers but did not verify. The old key was NOT deleted and is still active.`);
      return finish();
    }
    updates["RESEND_API_KEY_ID"] = newKey.id;
    if (!(await step("resend:delete-old-key", () => deps.resendDeleteKey(resend.RESEND_API_KEY_ID)))) {
      followUps.push("The old Resend key was NOT deleted. Delete it in the Resend dashboard (its id is RESEND_API_KEY_ID in .env.backup).");
      return finish();
    }
    doneTargets.add("resend");
  }

  // ---- Unsubscribe secret ----
  const unsub = checked.inputs.unsubscribe;
  if (unsub !== undefined) {
    const expiresAt = new Date(deps.now().getTime() + PREVIOUS_SECRET_DAYS * 86_400_000).toISOString();
    const next = deps.randomSecret();
    addSecret(next);
    if (!(await step("unsubscribe:put-UNSUBSCRIBE_SECRET_PREVIOUS:api", () => put("api", "UNSUBSCRIBE_SECRET_PREVIOUS", unsub.UNSUBSCRIBE_SECRET)))) return finish();
    if (!(await step("unsubscribe:put-UNSUBSCRIBE_SECRET_PREVIOUS_EXPIRES_AT:api", () => put("api", "UNSUBSCRIBE_SECRET_PREVIOUS_EXPIRES_AT", expiresAt)))) return finish();
    if (!(await step("unsubscribe:put-UNSUBSCRIBE_SECRET:api", async () => {
      await put("api", "UNSUBSCRIBE_SECRET", next);
      updates["UNSUBSCRIBE_SECRET"] = next;
      changed.add("UNSUBSCRIBE_SECRET");
    }))) return finish();
    if (!(await step("unsubscribe:put-UNSUBSCRIBE_SECRET:poller", () => put("poller", "UNSUBSCRIBE_SECRET", next)))) {
      followUps.push("The api Worker has the new unsubscribe secret but the poller does not. Links the poller signs with the old secret stay valid on the api until the previous secret expires.");
      return finish();
    }
    doneTargets.add("unsubscribe");
    followUps.push(`Links signed with the previous unsubscribe secret stay valid until ${expiresAt}.`);
  }

  return finish();
}

/** The value-free report: names, steps and follow-ups only. */
export function formatReport(res: RotationResult): string[] {
  const lines: string[] = ["", "Rotation report"];
  lines.push(`Outcome: ${res.outcome}`);
  if (res.failedStep !== null) lines.push(`Failed step: ${res.failedStep}${res.error !== null ? ` (${res.error})` : ""}`);
  lines.push(`Completed steps: ${res.completedSteps.length > 0 ? res.completedSteps.join(", ") : "none"}`);
  lines.push(`Secrets changed: ${res.changed.length > 0 ? res.changed.join(", ") : "none"}`);
  lines.push(`Not rotated: ${res.notRotated.length > 0 ? res.notRotated.join(", ") : "none"}`);
  for (const w of ["api", "poller"] as const) {
    lines.push(`Worker ${w} updated: ${res.workerSecrets[w].length > 0 ? res.workerSecrets[w].join(", ") : "none"}`);
  }
  lines.push(`.env keys written: ${res.envKeysWritten.length > 0 ? res.envKeysWritten.join(", ") : "none"}`);
  if (res.followUps.length > 0) {
    lines.push("Follow-ups:");
    for (const f of res.followUps) lines.push(`  - ${f}`);
  }
  return lines;
}
