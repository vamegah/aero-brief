// Real adapters for the rotation script (Node only). These are the only place that touches the
// network, child processes and the file system. Error messages carry status codes and step
// names, never request or response bodies, so a secret cannot leak through an error.
import { spawn } from "node:child_process";
import { copyFileSync, existsSync, renameSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import { updateEnvText } from "./env-file.ts";
import type { NeonInputs, ResendInputs } from "./inputs.ts";
import type { WorkerName } from "./run-rotation.ts";

const SECRET_NAME = /^[A-Z][A-Z0-9_]*$/;
const SECRET_ENV_PREFIXES = ["NEON_", "RESEND_", "DATABASE_URL", "RUNTIME_DATABASE_URL", "TEST_DATABASE_URL", "UNSUBSCRIBE_"];
const TIMEOUT_MS = 15_000;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Env for child processes: the caller's env minus anything that looks like one of our secrets. */
function childEnv(source: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(source)) {
    if (v === undefined) continue;
    if (SECRET_ENV_PREFIXES.some((p) => k.toUpperCase().startsWith(p))) continue;
    out[k] = v;
  }
  return out;
}

// ---------- wrangler ----------

function runWrangler(args: string[], cwd: string, stdin: string | null): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve, reject) => {
    // `shell: true` lets Windows find npx.cmd. Every argument is a fixed word or a validated name.
    const child = spawn("npx", ["wrangler", ...args], { cwd, env: childEnv(process.env), shell: true });
    let stderr = "";
    child.stdout.on("data", () => {});
    child.stderr.on("data", (c) => {
      stderr = (stderr + c.toString()).slice(-400);
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stderr }));
    child.stdin.on("error", () => {});
    if (stdin !== null) child.stdin.write(stdin);
    child.stdin.end();
  });
}

export function createWranglerAdapter(repoRoot: string): {
  whoami(): Promise<void>;
  putSecret(worker: WorkerName, name: string, value: string): Promise<void>;
} {
  const dirs: Record<WorkerName, string> = {
    api: join(repoRoot, "apps", "api"),
    poller: join(repoRoot, "apps", "poller"),
  };
  return {
    async whoami() {
      const r = await runWrangler(["whoami"], dirs.api, null);
      if (r.code !== 0) throw new Error("`wrangler whoami` failed. Run `npx wrangler login` first.");
    },
    async putSecret(worker, name, value) {
      if (!SECRET_NAME.test(name)) throw new Error("Invalid secret name");
      // The value goes through stdin only, never through the command line.
      const r = await runWrangler(["secret", "put", name], dirs[worker], value);
      if (r.code !== 0) {
        throw new Error(`wrangler secret put ${name} failed for the ${worker} Worker (exit ${String(r.code)}): ${r.stderr.trim()}`);
      }
    },
  };
}

// ---------- Neon ----------
// POST /projects/{project_id}/branches/{branch_id}/roles/{role_name}/reset_password
// https://neon.com/docs/reference/api/branches/reset-project-branch-role-password

const neonResponse = z.object({ role: z.object({ password: z.string().min(1) }) });

export function createNeonAdapter(inputs: NeonInputs): { resetPassword(): Promise<string> } {
  return {
    async resetPassword() {
      const url =
        `https://console.neon.tech/api/v2/projects/${encodeURIComponent(inputs.NEON_PROJECT_ID)}` +
        `/branches/${encodeURIComponent(inputs.NEON_BRANCH_ID)}` +
        `/roles/${encodeURIComponent(inputs.NEON_ROLE_NAME)}/reset_password`;
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${inputs.NEON_API_KEY}`, Accept: "application/json" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`Neon reset_password responded with HTTP ${res.status}`);
      const parsed = neonResponse.safeParse(await res.json());
      if (!parsed.success) throw new Error("Neon reset_password returned an unexpected response shape");
      return parsed.data.role.password;
    },
  };
}

/** GET {frontendUrl}/api/status/national must be 200 with state ok or no_data. Retries while secrets propagate. */
export async function verifyNationalStatus(frontendUrl: string, attempts = 10, delayMs = 3000): Promise<void> {
  const url = `${frontendUrl.replace(/\/+$/, "")}/api/status/national`;
  let last = "no attempt made";
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await sleep(delayMs);
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (res.status === 200) {
        const body: unknown = await res.json();
        const state = typeof body === "object" && body !== null ? (body as Record<string, unknown>)["state"] : undefined;
        if (state === "ok" || state === "no_data") return;
        last = "HTTP 200 with an unexpected state";
      } else {
        last = `HTTP ${res.status}`;
      }
    } catch {
      last = "request failed";
    }
  }
  throw new Error(`National status check did not pass after ${attempts} attempts (last: ${last})`);
}

// ---------- Resend ----------
// GET /domains, POST /api-keys, POST /emails, DELETE /api-keys/{id}
// https://resend.com/docs/api-reference/api-keys/create-api-key

const RESEND = "https://api.resend.com";
const domainsResponse = z.object({ data: z.array(z.object({ id: z.string(), name: z.string() })) });
const createKeyResponse = z.object({ id: z.string().min(1), token: z.string().min(1) });

async function resendFetch(path: string, key: string, method: string, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = { Authorization: `Bearer ${key}` };
  const init: RequestInit = { method, headers, signal: AbortSignal.timeout(TIMEOUT_MS) };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  return fetch(`${RESEND}${path}`, init);
}

export function createResendAdapter(inputs: ResendInputs): {
  resolveDomainId(): Promise<string>;
  createKey(name: string, domainId: string): Promise<{ id: string; token: string }>;
  sendTestEmail(token: string): Promise<void>;
  deleteKey(id: string): Promise<void>;
} {
  return {
    async resolveDomainId() {
      if (inputs.RESEND_DOMAIN_ID !== undefined) return inputs.RESEND_DOMAIN_ID;
      const res = await resendFetch("/domains", inputs.RESEND_ADMIN_API_KEY, "GET");
      if (!res.ok) throw new Error(`Resend list domains responded with HTTP ${res.status}`);
      const parsed = domainsResponse.safeParse(await res.json());
      if (!parsed.success) throw new Error("Resend list domains returned an unexpected response shape");
      const match = parsed.data.data.find((d) => d.name === inputs.RESEND_DOMAIN_NAME);
      if (match === undefined) throw new Error(`Resend domain ${inputs.RESEND_DOMAIN_NAME} was not found`);
      return match.id;
    },
    async createKey(name, domainId) {
      const res = await resendFetch("/api-keys", inputs.RESEND_ADMIN_API_KEY, "POST", {
        name,
        permission: "sending_access",
        domain_id: domainId,
      });
      if (!res.ok) throw new Error(`Resend create API key responded with HTTP ${res.status}`);
      const parsed = createKeyResponse.safeParse(await res.json());
      if (!parsed.success) throw new Error("Resend create API key returned an unexpected response shape");
      return parsed.data;
    },
    async sendTestEmail(token) {
      const res = await resendFetch("/emails", token, "POST", {
        from: inputs.MAIL_FROM,
        to: ["delivered@resend.dev"],
        subject: "AeroBrief key rotation check",
        text: "This message verifies the new AeroBrief Resend key.",
      });
      if (!res.ok) throw new Error(`Resend send test email responded with HTTP ${res.status}`);
    },
    async deleteKey(id) {
      const res = await resendFetch(`/api-keys/${encodeURIComponent(id)}`, inputs.RESEND_ADMIN_API_KEY, "DELETE");
      if (!res.ok) throw new Error(`Resend delete API key responded with HTTP ${res.status}`);
    },
  };
}

// ---------- Local env file ----------

/**
 * Copies the current file to `<path>.backup`, then writes the updated text to a temp file in the
 * same directory and renames it over the original (atomic on the same volume).
 */
export function writeEnvAtomically(envPath: string, updates: Readonly<Record<string, string>>): void {
  const current = readFileSync(envPath, "utf8");
  const next = updateEnvText(current, updates);
  copyFileSync(envPath, `${envPath}.backup`);
  const temp = join(dirname(envPath), `.env.rotate-tmp-${Date.now()}`);
  try {
    writeFileSync(temp, next, { mode: 0o600 });
    renameSync(temp, envPath);
  } catch (e) {
    if (existsSync(temp)) unlinkSync(temp);
    throw e;
  }
}
