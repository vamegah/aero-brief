// CLI entry for secret rotation (Requirement 16). Run: npm run rotate-secrets -- [options]
// Node 24 runs this file directly (type stripping), so only erasable TypeScript syntax is used.
// This is the edge of the system: it is the only place that reads the env file.
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { parseArgs, USAGE } from "./rotation/args.ts";
import { parseEnvText } from "./rotation/env-file.ts";
import { validateInputs } from "./rotation/inputs.ts";
import { runRotation } from "./rotation/run-rotation.ts";
import type { RotationDeps } from "./rotation/run-rotation.ts";
import {
  createNeonAdapter,
  createResendAdapter,
  createWranglerAdapter,
  verifyNationalStatus,
  writeEnvAtomically,
} from "./rotation/adapters.ts";

const out = (line: string): void => {
  process.stdout.write(`${line}\n`);
};

async function confirmInteractively(): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(
      "Is the API with previous-secret support (task 19.1) already deployed? Type yes to continue: ",
    );
    return answer.trim().toLowerCase() === "yes";
  } finally {
    rl.close();
  }
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed.ok) {
    process.stderr.write(`${parsed.error}\n\n${USAGE}\n`);
    process.exitCode = 2;
    return;
  }
  const options = parsed.options;
  if (options.help) {
    out(USAGE);
    return;
  }

  const repoRoot = resolve(import.meta.dirname, "..");
  const envPath = options.envFile !== null ? resolve(options.envFile) : join(repoRoot, ".env");
  if (!existsSync(envPath)) {
    process.stderr.write("The env file was not found. Pass --env-path <path> or create .env.\n");
    process.exitCode = 2;
    return;
  }
  const envValues = parseEnvText(readFileSync(envPath, "utf8"));

  const checked = validateInputs(envValues, options.targets);
  if (!checked.ok) {
    process.stderr.write(`Missing or invalid variables in the env file: ${checked.invalid.join(", ")}\n`);
    process.exitCode = 2;
    return;
  }
  const { neon, resend } = checked.inputs;

  let confirmApiDeployed = options.confirmApiDeployed;
  if (!options.dryRun && options.targets.includes("unsubscribe") && !confirmApiDeployed && process.stdin.isTTY === true) {
    confirmApiDeployed = await confirmInteractively();
  }

  const wrangler = createWranglerAdapter(repoRoot);
  const neonAdapter = neon === undefined ? null : createNeonAdapter(neon);
  const resendAdapter = resend === undefined ? null : createResendAdapter(resend);
  const need = <T>(adapter: T | null | undefined): T => {
    if (adapter === null || adapter === undefined) throw new Error("Adapter not configured for this run");
    return adapter;
  };

  const deps: RotationDeps = {
    now: () => new Date(),
    randomSecret: () => randomBytes(32).toString("base64url"),
    log: out,
    whoami: () => wrangler.whoami(),
    neonResetPassword: () => need(neonAdapter).resetPassword(),
    verifyNationalStatus: () => verifyNationalStatus(need(neon).FRONTEND_URL),
    putWorkerSecret: (worker, name, value) => wrangler.putSecret(worker, name, value),
    resendResolveDomainId: () => need(resendAdapter).resolveDomainId(),
    resendCreateKey: (name, domainId) => need(resendAdapter).createKey(name, domainId),
    resendSendTestEmail: (token) => need(resendAdapter).sendTestEmail(token),
    resendDeleteKey: (id) => need(resendAdapter).deleteKey(id),
    writeEnv: (updates) => Promise.resolve().then(() => writeEnvAtomically(envPath, updates)),
  };

  const result = await runRotation(deps, {
    targets: options.targets,
    dryRun: options.dryRun,
    confirmApiDeployed,
    envValues,
  });
  if (result.outcome === "failed") process.exitCode = 1;
}

main().catch((e: unknown) => {
  // Print only the error name: messages from lower layers are not guaranteed to be value-free.
  process.stderr.write(`Unexpected error (${e instanceof Error ? e.name : "unknown"}). No further steps were run.\n`);
  process.exitCode = 1;
});
