// Tests for scripts/rotate-secrets.ts (Requirement 16). Only the pure modules under
// scripts/rotation are imported; every external call is replaced by an injected fake.
import { describe, expect, it } from "vitest";
import { parseArgs } from "../scripts/rotation/args.ts";
import {
  connectionUserMatches,
  getConnectionPassword,
  replaceConnectionPassword,
} from "../scripts/rotation/connection-string.ts";
import { parseEnvText, updateEnvText } from "../scripts/rotation/env-file.ts";
import { buildPlan } from "../scripts/rotation/plan.ts";
import { findRoleUrls, runRotation } from "../scripts/rotation/run-rotation.ts";
import type { RotationDeps, RotationOptions, WorkerName } from "../scripts/rotation/run-rotation.ts";

describe("replaceConnectionPassword", () => {
  it("replaces only the password and keeps host, path and query", () => {
    const url = "postgresql://app_user:old@ep-x-pooler.eu.aws.neon.tech/neondb?sslmode=require&channel_binding=require";
    expect(replaceConnectionPassword(url, "NewPass1")).toBe(
      "postgresql://app_user:NewPass1@ep-x-pooler.eu.aws.neon.tech/neondb?sslmode=require&channel_binding=require",
    );
  });

  it("percent-encodes special characters so the password round-trips", () => {
    const pw = "p@ss:w/rd#?%&=+ !'()*";
    const next = replaceConnectionPassword("postgres://u:old@h/db", pw);
    expect(next).toMatch(/^postgres:\/\/u:[^@/?#]+@h\/db$/);
    expect(getConnectionPassword(next)).toBe(pw);
    expect(new URL(next).username).toBe("u");
    expect(decodeURIComponent(new URL(next).password)).toBe(pw);
  });

  it("adds a password when none exists, and handles an '@' inside the old password", () => {
    expect(replaceConnectionPassword("postgresql://u@h/db", "x")).toBe("postgresql://u:x@h/db");
    expect(replaceConnectionPassword("postgresql://u:a@b@h/db", "x")).toBe("postgresql://u:x@h/db");
  });

  it("throws, without echoing the string, when there is no userinfo", () => {
    expect(() => replaceConnectionPassword("postgresql://h/db", "x")).toThrow(/no user/);
  });

  it("matches users exactly, and findRoleUrls leaves other roles untouched", () => {
    expect(connectionUserMatches("postgresql://role_a:p@h/db", "role_a")).toBe(true);
    expect(connectionUserMatches("postgresql://role_ab:p@h/db", "role_a")).toBe(false);
    const found = findRoleUrls(
      {
        RUNTIME_DATABASE_URL: "postgresql://rt:p@h/db",
        DATABASE_URL: "postgresql://owner:p@h/db",
        DATABASE_URL_UNPOOLED: "postgresql://owner:p@h2/db",
        TEST_DATABASE_URL: "postgresql://rt:p@h/test",
      },
      "rt",
    );
    expect(found).toEqual({ keys: ["RUNTIME_DATABASE_URL", "TEST_DATABASE_URL"], workerKey: "RUNTIME_DATABASE_URL" });
    expect(findRoleUrls({ DATABASE_URL: "postgresql://owner:p@h/db" }, "rt").workerKey).toBeNull();
  });
});

describe("updateEnvText", () => {
  const base = ["# header", "A=1", 'B="two words" # note', "export C='c'", "", "# D=commented"].join("\n") + "\n";

  it("updates existing keys in place and keeps comments, quoting and trailing comments", () => {
    const out = updateEnvText(base, { A: "9", B: "new", C: "z" });
    expect(out).toBe(["# header", "A=9", 'B="new" # note', "export C='z'", "", "# D=commented"].join("\n") + "\n");
  });

  it("appends new keys, never touching a commented-out key", () => {
    const out = updateEnvText(base, { D: "real" });
    expect(out.startsWith(base)).toBe(true);
    expect(out.endsWith("D=real\n")).toBe(true);
    expect(parseEnvText(out)["D"]).toBe("real");
  });

  it("appends after a missing final newline and keeps CRLF line endings", () => {
    expect(updateEnvText("A=1", { B: "2" })).toBe("A=1\nB=2\n");
    expect(updateEnvText("A=1\r\nB=2\r\n", { A: "5", C: "3" })).toBe("A=5\r\nB=2\r\nC=3\r\n");
  });

  it("quotes new values that need it and refuses line breaks", () => {
    expect(updateEnvText("", { M: "A B" })).toBe('M="A B"\n');
    expect(() => updateEnvText("", { M: "a\nb" })).toThrow(/line break/);
  });

  it("parseEnvText reads quoted and unquoted values", () => {
    expect(parseEnvText('A=1\nB="x y"\nC=z # c\n# D=1\n')).toEqual({ A: "1", B: "x y", C: "z" });
  });
});

describe("parseArgs and buildPlan", () => {
  it("defaults to all targets and accepts --only in both spellings, in canonical order", () => {
    const all = parseArgs([]);
    expect(all.ok && all.options.targets).toEqual(["neon", "resend", "unsubscribe"]);
    const a = parseArgs(["--only=unsubscribe,neon"]);
    expect(a.ok && a.options.targets).toEqual(["neon", "unsubscribe"]);
    const b = parseArgs(["--only", "resend", "--dry-run", "--env-path", "x.env"]);
    expect(b.ok && b.options).toMatchObject({ targets: ["resend"], dryRun: true, envFile: "x.env" });
  });

  it("rejects unknown targets and options", () => {
    expect(parseArgs(["--only=db"]).ok).toBe(false);
    expect(parseArgs(["--only="]).ok).toBe(false);
    expect(parseArgs(["--wat"]).ok).toBe(false);
  });

  it("builds steps only for the selected targets, with preflight first and the env write last", () => {
    const ids = (targets: Parameters<typeof buildPlan>[0]["targets"]) =>
      buildPlan({ targets, dryRun: false }).steps.map((s) => s.id);
    expect(ids(["resend"])).toEqual([
      "preflight",
      "resend:create-key",
      "resend:put-RESEND_API_KEY:api",
      "resend:put-RESEND_API_KEY:poller",
      "resend:verify-send",
      "resend:delete-old-key",
      "local:write-env",
    ]);
    const neonAndUnsub = ids(["neon", "unsubscribe"]);
    expect(neonAndUnsub.some((i) => i.startsWith("resend:"))).toBe(false);
    expect(neonAndUnsub.indexOf("neon:verify-status")).toBeLessThan(neonAndUnsub.indexOf("unsubscribe:put-UNSUBSCRIBE_SECRET:api"));
    expect(buildPlan({ targets: ["neon"], dryRun: true }).dryRun).toBe(true);
  });
});

// ---------- runRotation with fakes ----------

const OLD_PW = "oldPwAAA111";
const NEW_PW = "new/pw:BBB@222";
const NEW_TOKEN = "re_NEWTOKEN_ccc333";
const NEW_UNSUB = "newUnsubSecretDDD444";
const NEON_KEY = "napi_KEY_eee555";
const ADMIN_KEY = "re_ADMIN_fff666";
const OLD_RESEND = "re_OLDRUNTIME_ggg777";
const OLD_UNSUB = "oldUnsubSecretHHH888";
const ALL_SECRETS = [OLD_PW, NEW_PW, encodeURIComponent(NEW_PW), NEW_TOKEN, NEW_UNSUB, NEON_KEY, ADMIN_KEY, OLD_RESEND, OLD_UNSUB];

const ENV = {
  NEON_API_KEY: NEON_KEY,
  NEON_PROJECT_ID: "proj-1",
  NEON_BRANCH_ID: "br-1",
  NEON_ROLE_NAME: "runtime_role",
  FRONTEND_URL: "https://www.example.com",
  RESEND_ADMIN_API_KEY: ADMIN_KEY,
  RESEND_API_KEY_ID: "old-key-id",
  RESEND_API_KEY: OLD_RESEND,
  MAIL_FROM: "AeroBrief <alerts@example.com>",
  UNSUBSCRIBE_SECRET: OLD_UNSUB,
  RUNTIME_DATABASE_URL: `postgresql://runtime_role:${OLD_PW}@h-pooler.neon.tech/db?sslmode=require`,
  DATABASE_URL: `postgresql://owner:ownerPw@h.neon.tech/db?sslmode=require`,
  TEST_DATABASE_URL: `postgresql://runtime_role:${OLD_PW}@h-pooler.neon.tech/testdb?sslmode=require`,
};

interface Harness {
  deps: RotationDeps;
  calls: string[];
  logs: string[];
  writes: Record<string, string>[];
  puts: { worker: WorkerName; name: string; value: string }[];
}

function harness(overrides: Partial<RotationDeps> = {}): Harness {
  const calls: string[] = [];
  const logs: string[] = [];
  const writes: Record<string, string>[] = [];
  const puts: Harness["puts"] = [];
  const deps: RotationDeps = {
    now: () => new Date("2026-03-01T12:00:00.000Z"),
    randomSecret: () => NEW_UNSUB,
    log: (l) => void logs.push(l),
    whoami: async () => void calls.push("whoami"),
    neonResetPassword: async () => (calls.push("neon.reset"), NEW_PW),
    verifyNationalStatus: async () => void calls.push("verify.status"),
    putWorkerSecret: async (worker, name, value) => {
      calls.push(`put:${worker}:${name}`);
      puts.push({ worker, name, value });
    },
    resendResolveDomainId: async () => (calls.push("resend.domain"), "dom-1"),
    resendCreateKey: async () => (calls.push("resend.create"), { id: "new-key-id", token: NEW_TOKEN }),
    resendSendTestEmail: async () => void calls.push("resend.send"),
    resendDeleteKey: async (id) => void calls.push(`resend.delete:${id}`),
    writeEnv: async (u) => (calls.push("writeEnv"), void writes.push({ ...u })),
    ...overrides,
  };
  return { deps, calls, logs, writes, puts };
}

const options = (over: Partial<RotationOptions> = {}): RotationOptions => ({
  targets: ["neon", "resend", "unsubscribe"],
  dryRun: false,
  confirmApiDeployed: true,
  envValues: ENV,
  ...over,
});

function expectNoSecrets(texts: string[]): void {
  const joined = texts.join("\n");
  for (const s of ALL_SECRETS) expect(joined).not.toContain(s);
}

describe("runRotation", () => {
  it("runs every step in the designed order on the happy path", async () => {
    const h = harness();
    const res = await runRotation(h.deps, options());
    expect(res.outcome).toBe("success");
    expect(h.calls).toEqual([
      "whoami",
      "neon.reset",
      "put:api:DATABASE_URL",
      "put:poller:DATABASE_URL",
      "verify.status",
      "resend.domain",
      "resend.create",
      "put:api:RESEND_API_KEY",
      "put:poller:RESEND_API_KEY",
      "resend.send",
      "resend.delete:old-key-id",
      "put:api:UNSUBSCRIBE_SECRET_PREVIOUS",
      "put:api:UNSUBSCRIBE_SECRET_PREVIOUS_EXPIRES_AT",
      "put:api:UNSUBSCRIBE_SECRET",
      "put:poller:UNSUBSCRIBE_SECRET",
      "writeEnv",
    ]);
    expect(res.notRotated).toEqual([]);
    expect(res.changed).toEqual(["Neon role password", "RESEND_API_KEY", "UNSUBSCRIBE_SECRET"]);
  });

  it("pushes the right values to the Workers and writes the matching .env lines", async () => {
    const h = harness();
    await runRotation(h.deps, options());
    const dbPut = h.puts.find((p) => p.name === "DATABASE_URL" && p.worker === "api")!;
    expect(getConnectionPassword(dbPut.value)).toBe(NEW_PW);
    expect(dbPut.value).toContain("@h-pooler.neon.tech/db?sslmode=require");
    expect(h.puts.find((p) => p.name === "UNSUBSCRIBE_SECRET_PREVIOUS")?.value).toBe(OLD_UNSUB);
    expect(h.puts.find((p) => p.name === "UNSUBSCRIBE_SECRET_PREVIOUS_EXPIRES_AT")?.value).toBe("2026-03-31T12:00:00.000Z");
    const written = h.writes[0]!;
    expect(Object.keys(written).sort()).toEqual([
      "RESEND_API_KEY",
      "RESEND_API_KEY_ID",
      "RUNTIME_DATABASE_URL",
      "TEST_DATABASE_URL",
      "UNSUBSCRIBE_SECRET",
    ]);
    expect(written["RESEND_API_KEY_ID"]).toBe("new-key-id");
    expect(written["DATABASE_URL"]).toBeUndefined(); // other role, untouched
  });

  it("never emits a secret in any logged line, including report and error text", async () => {
    const h = harness({
      putWorkerSecret: async (_w, name) => {
        if (name === "RESEND_API_KEY") throw new Error(`boom ${NEW_TOKEN} ${NEW_PW} ${OLD_RESEND}`);
      },
    });
    const res = await runRotation(h.deps, options());
    expect(res.outcome).toBe("failed");
    expectNoSecrets(h.logs);
    expectNoSecrets([res.error ?? "", ...res.followUps, ...res.completedSteps]);
    const happy = harness();
    const ok = await runRotation(happy.deps, options());
    expectNoSecrets(happy.logs);
    expectNoSecrets([ok.error ?? "", ...ok.followUps]);
  });

  it("dry-run prints the plan and calls nothing", async () => {
    const h = harness();
    const res = await runRotation(h.deps, options({ dryRun: true }));
    expect(res.outcome).toBe("dry-run");
    expect(h.calls).toEqual([]);
    expect(h.logs.join("\n")).toContain("Dry run");
    expectNoSecrets(h.logs);
  });

  it("--only runs just the selected target", async () => {
    const h = harness();
    await runRotation(h.deps, options({ targets: ["unsubscribe"] }));
    expect(h.calls.some((c) => c.startsWith("neon") || c.startsWith("resend"))).toBe(false);
    expect(h.writes[0]).toEqual({ UNSUBSCRIBE_SECRET: NEW_UNSUB });
  });

  it("Neon reset ok but Worker put fails: stops, reports, and still writes the new Neon URLs to .env", async () => {
    const h = harness({
      putWorkerSecret: async (worker, name) => {
        if (worker === "poller" && name === "DATABASE_URL") throw new Error("wrangler exploded");
      },
    });
    const res = await runRotation(h.deps, options());
    expect(res.outcome).toBe("failed");
    expect(res.failedStep).toBe("neon:put-DATABASE_URL:poller");
    expect(res.notRotated).toEqual(["neon", "resend", "unsubscribe"]);
    expect(res.changed).toEqual(["Neon role password"]);
    expect(h.calls).not.toContain("verify.status");
    expect(h.calls.some((c) => c.startsWith("resend") || c.includes("RESEND") || c.includes("UNSUBSCRIBE"))).toBe(false);
    expect(h.writes).toHaveLength(1);
    expect(getConnectionPassword(h.writes[0]!["RUNTIME_DATABASE_URL"]!)).toBe(NEW_PW);
    expect(res.envKeysWritten).toEqual(["RUNTIME_DATABASE_URL", "TEST_DATABASE_URL"]);
    expect(res.workerSecrets).toEqual({ api: ["DATABASE_URL"], poller: [] });
  });

  it("writes nothing when the failure happens before anything changed", async () => {
    const h = harness({ neonResetPassword: async () => { throw new Error("HTTP 401"); } });
    const res = await runRotation(h.deps, options());
    expect(res.failedStep).toBe("neon:reset-password");
    expect(h.writes).toEqual([]);
    expect(res.envKeysWritten).toEqual([]);
  });

  it("Resend verify fails: the old key is NOT deleted and the unsubscribe step does not run", async () => {
    const h = harness({ resendSendTestEmail: async () => { throw new Error("HTTP 403"); } });
    const res = await runRotation(h.deps, options());
    expect(res.outcome).toBe("failed");
    expect(res.failedStep).toBe("resend:verify-send");
    expect(h.calls.some((c) => c.startsWith("resend.delete"))).toBe(false);
    expect(h.calls.some((c) => c.includes("UNSUBSCRIBE"))).toBe(false);
    expect(res.notRotated).toEqual(["resend", "unsubscribe"]);
    // Workers hold the new key, so .env follows; the old key's id stays recorded.
    expect(h.writes[0]!["RESEND_API_KEY"]).toBe(NEW_TOKEN);
    expect(h.writes[0]!["RESEND_API_KEY_ID"]).toBeUndefined();
  });

  it("does not touch .env for Resend when no Worker accepted the new key", async () => {
    const h = harness({ putWorkerSecret: async (_w, name) => { if (name === "RESEND_API_KEY") throw new Error("nope"); } });
    const res = await runRotation(h.deps, options({ targets: ["resend"] }));
    expect(res.failedStep).toBe("resend:put-RESEND_API_KEY:api");
    expect(h.writes).toEqual([]);
    expect(h.calls.some((c) => c.startsWith("resend.delete"))).toBe(false);
  });

  it("reports a failed old-key delete and keeps the new id in .env", async () => {
    const h = harness({ resendDeleteKey: async () => { throw new Error("HTTP 500"); } });
    const res = await runRotation(h.deps, options({ targets: ["resend"] }));
    expect(res.outcome).toBe("failed");
    expect(res.failedStep).toBe("resend:delete-old-key");
    expect(h.writes[0]!["RESEND_API_KEY_ID"]).toBe("new-key-id");
    expect(res.followUps.join(" ")).toContain("NOT deleted");
  });

  it("fails preflight, with no external call, for missing inputs, an unmatched role, or an unconfirmed API", async () => {
    const missing = harness();
    const r1 = await runRotation(missing.deps, options({ envValues: { ...ENV, NEON_API_KEY: "" } }));
    expect(r1.failedStep).toBe("preflight");
    expect(r1.error).toContain("NEON_API_KEY");

    const nomatch = harness();
    const r2 = await runRotation(nomatch.deps, options({ envValues: { ...ENV, NEON_ROLE_NAME: "someone_else" } }));
    expect(r2.failedStep).toBe("preflight");

    const unconfirmed = harness();
    const r3 = await runRotation(unconfirmed.deps, options({ confirmApiDeployed: false }));
    expect(r3.failedStep).toBe("preflight");
    expect(r3.error).toContain("--confirm-api-deployed");

    for (const h of [missing, nomatch, unconfirmed]) expect(h.calls).toEqual([]);
  });

  it("stops before any change when wrangler whoami fails", async () => {
    const h = harness({ whoami: async () => { throw new Error("not logged in"); } });
    const res = await runRotation(h.deps, options());
    expect(res.failedStep).toBe("preflight:wrangler-whoami");
    expect(h.calls).toEqual([]);
  });

  it("reports when the local .env cannot be written", async () => {
    const h = harness({ writeEnv: async () => { throw new Error(`disk full ${NEW_PW}`); } });
    const res = await runRotation(h.deps, options({ targets: ["neon"] }));
    expect(res.outcome).toBe("failed");
    expect(res.failedStep).toBe("local:write-env");
    expectNoSecrets(h.logs);
  });
});
