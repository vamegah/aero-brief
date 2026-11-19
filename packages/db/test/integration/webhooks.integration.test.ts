/// <reference types="vite/client" />
/**
 * Neon branch integration tests for webhooks (Phase 2 task 4.27; Requirements 4.7, 13.2, 13.3, 13.8,
 * 13.9, 16.3, 16.16, 18.6).
 *
 * The whole suite SKIPS, with no connection attempt, unless ALL of the following hold:
 *   - PHASE2_RUN_INTEGRATION_TESTS is exactly "true" (explicit opt-in),
 *   - PHASE2_DATABASE_URL is set to the OWNER role URL of the Phase 2 Neon branch. There is no fallback to
 *     DATABASE_URL, which is the runtime-role URL and would fail with "permission denied",
 *   - PHASE2_DB_HOST and PRODUCTION_DB_HOST are set, and
 *   - `assertPhase2Target(url, PHASE2_DB_HOST, PRODUCTION_DB_HOST)` passes.
 * The guard is a pure string check done when this file loads. It opens no connection, and no database
 * client is created at module level. The branch must already have migration 0004 applied and the 0004 grants.
 *
 * Command (PowerShell, on branch `phase-2`; variables must already be set to the Phase 2 branch):
 *   $env:PHASE2_RUN_INTEGRATION_TESTS = "true"; npx vitest --run packages/db/test/integration/webhooks.integration.test.ts
 * Add `$env:PHASE2_ALLOW_DDL_TESTS = "true"` to also run the destructive down/up test.
 *
 * Data tests create their own users (`it+<uuid>@example.invalid`) and delete them afterwards. They never
 * touch the seeded users or other rows.
 *
 * The down/up snapshot test is DESTRUCTIVE: it drops the webhook tables (and their rows) with
 * migrations/down/0004_webhooks.down.sql and re-applies 0004. It runs only when PHASE2_ALLOW_DDL_TESTS=true,
 * and always restores 0004 (and the runtime grants, if they existed) in a finally block.
 *
 * Optional: RUNTIME_ROLE (default `aerobrief_runtime`) names the role the grants test checks.
 */
import { applyOutcome, type WebhookCounterState, type WebhookOutcomeEvent } from "@aerobrief/core";
import { neon } from "@neondatabase/serverless";
import { eq } from "drizzle-orm";
import fc from "fast-check";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "../../src/repositories/client";
import { assertPhase2Target, Phase2TargetError } from "../../src/phase2-target";
import { users, webhookDeliveries, webhooks } from "../../src/schema";
import {
  claimDeliveryQuery,
  claimTestSlotQuery,
  reenableWebhookQuery,
  recordWebhookOutcomeQuery,
  webhookRepository,
  WebhookLimitError,
} from "../../src/webhooks";

declare const process: { readonly env: Readonly<Record<string, string | undefined>> };

const sqlFiles = import.meta.glob<string>(
  ["../../migrations/0004_webhooks.sql", "../../migrations/down/0004_webhooks.down.sql"],
  { query: "?raw", import: "default", eager: true },
);

const env = process.env;
const optedIn = env["PHASE2_RUN_INTEGRATION_TESTS"] === "true";
// Owner-role URL only. DATABASE_URL is deliberately never read.
const DATABASE_URL = env["PHASE2_DATABASE_URL"]?.trim() || undefined;

// The guard runs here, before any connection, and only parses strings. A refusal skips the suite.
function targetAllowed(): boolean {
  if (!optedIn || DATABASE_URL === undefined) return false;
  try {
    assertPhase2Target(DATABASE_URL, env["PHASE2_DB_HOST"], env["PRODUCTION_DB_HOST"]);
    return true;
  } catch (e: unknown) {
    console.warn(
      `webhooks.integration: skipped. ${e instanceof Phase2TargetError ? e.message : "target check failed"}`,
    );
    return false;
  }
}

const enabled = targetAllowed();
const ddlAllowed = enabled && env["PHASE2_ALLOW_DDL_TESTS"] === "true";
const RUNTIME_ROLE = env["RUNTIME_ROLE"]?.trim() || "aerobrief_runtime";

const sqlOf = (name: string): string => {
  const sql = Object.entries(sqlFiles).find(([path]) => path.endsWith(name))?.[1];
  if (sql === undefined) throw new Error(`sql file not found: ${name}`);
  return sql;
};

/** Drizzle migrations split on the breakpoint marker. The down file has simple statements only. */
const upStatements = (): string[] =>
  sqlOf("0004_webhooks.sql")
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s !== "");
const downStatements = (): string[] =>
  sqlOf("0004_webhooks.down.sql")
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n")
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.trim())
    .filter((s) => s !== "");

describe.skipIf(!enabled)("webhooks on the Phase 2 Neon branch (integration)", () => {
  let db: Db;
  let client: ReturnType<typeof neon>;
  const userIds: string[] = [];

  beforeAll(() => {
    // `enabled` implies DATABASE_URL is defined and has passed assertPhase2Target.
    db = createDb(DATABASE_URL as string);
    client = neon(DATABASE_URL as string);
  });

  afterAll(async () => {
    if (db === undefined) return;
    for (const id of userIds) await db.delete(users).where(eq(users.id, id));
  });

  async function newUser(): Promise<string> {
    const [row] = await db
      .insert(users)
      .values({ email: `it+${crypto.randomUUID()}@example.invalid` })
      .returning({ id: users.id });
    if (row === undefined) throw new Error("user insert returned no row");
    userIds.push(row.id);
    return row.id;
  }

  async function newWebhook(userId: string): Promise<string> {
    const id = crypto.randomUUID();
    await db.insert(webhooks).values({ id, userId, url: `https://hooks.example.invalid/${id}`, host: "hooks.example.invalid" });
    return id;
  }

  const count = async (table: typeof webhooks | typeof webhookDeliveries, col: "user" | "webhook", id: string) =>
    col === "user"
      ? (await db.select().from(webhooks).where(eq(webhooks.userId, id))).length
      : table === webhookDeliveries
        ? (await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.webhookId, id))).length
        : (await db.select().from(webhooks).where(eq(webhooks.id, id))).length;

  it("the cap holds under 5 concurrent inserts for one User (Req 13.2)", async () => {
    const userId = await newUser();
    const repo = webhookRepository(db);
    const now = new Date();
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, (_, i) =>
        repo.insert({ userId, url: `https://hooks.example.invalid/cap-${i}`, host: "hooks.example.invalid" }, now),
      ),
    );
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    expect(rejected).toHaveLength(2);
    for (const r of rejected) expect(r.reason).toBeInstanceOf(WebhookLimitError);
    expect(await count(webhooks, "user", userId)).toBe(3);
  });

  it("the delivery claim with ON CONFLICT DO NOTHING returns a row once (Req 16.3)", async () => {
    const userId = await newUser();
    const webhookId = await newWebhook(userId);
    const now = new Date();
    const key = { webhookId, eventKey: `evt-${crypto.randomUUID()}`, eventType: "GROUND_STOP" };

    const sequentialFirst = await claimDeliveryQuery(db, { id: crypto.randomUUID(), ...key }, now);
    const sequentialSecond = await claimDeliveryQuery(db, { id: crypto.randomUUID(), ...key }, now);
    expect(sequentialFirst).toHaveLength(1);
    expect(sequentialSecond).toHaveLength(0);

    const raceKey = { ...key, eventKey: `evt-${crypto.randomUUID()}` };
    const race = await Promise.all(
      Array.from({ length: 4 }, () => claimDeliveryQuery(db, { id: crypto.randomUUID(), ...raceKey }, now)),
    );
    expect(race.filter((rows) => rows.length === 1)).toHaveLength(1);
    expect(await count(webhookDeliveries, "webhook", webhookId)).toBe(2);
  });

  it("the SQL counter equals applyOutcome over random sequences (Req 16.16)", async () => {
    const userId = await newUser();
    const events = fc.array(fc.constantFrom<WebhookOutcomeEvent>("delivered", "failed", "skipped", "reenabled"), {
      minLength: 1,
      maxLength: 12,
    });
    await fc.assert(
      fc.asyncProperty(events, async (sequence) => {
        const webhookId = await newWebhook(userId);
        try {
          let model: WebhookCounterState = { failures: 0, disabled: false };
          for (const event of sequence) {
            if (event === "reenabled") await reenableWebhookQuery(db, userId, webhookId);
            else await recordWebhookOutcomeQuery(db, webhookId, event, new Date());
            model = applyOutcome(model, event);
            const [row] = await db.select().from(webhooks).where(eq(webhooks.id, webhookId));
            if (row === undefined) return false;
            if (row.consecutiveFailures !== model.failures) return false;
            if ((row.state === "disabled") !== model.disabled) return false;
          }
          return true;
        } finally {
          await db.delete(webhooks).where(eq(webhooks.id, webhookId));
        }
      }),
      { numRuns: 25 },
    );
  }, 300_000);

  it("the atomic test-slot update allows one of two simultaneous requests (Req 18.6)", async () => {
    const userId = await newUser();
    const webhookId = await newWebhook(userId);
    const now = new Date();
    const [a, b] = await Promise.all([
      claimTestSlotQuery(db, userId, webhookId, now),
      claimTestSlotQuery(db, userId, webhookId, now),
    ]);
    expect(a.length + b.length).toBe(1);
    // A third request inside the interval is refused; one after it is allowed.
    expect(await claimTestSlotQuery(db, userId, webhookId, new Date(now.getTime() + 30_000))).toHaveLength(0);
    expect(await claimTestSlotQuery(db, userId, webhookId, new Date(now.getTime() + 61_000))).toHaveLength(1);
  });

  it("deleting a User removes webhooks and deliveries (Req 13.8)", async () => {
    const userId = await newUser();
    const webhookId = await newWebhook(userId);
    await claimDeliveryQuery(
      db,
      { id: crypto.randomUUID(), webhookId, eventKey: `evt-${crypto.randomUUID()}`, eventType: "TEST" },
      new Date(),
    );
    expect(await count(webhookDeliveries, "webhook", webhookId)).toBe(1);

    await db.delete(users).where(eq(users.id, userId));

    expect(await count(webhooks, "user", userId)).toBe(0);
    expect(await count(webhookDeliveries, "webhook", webhookId)).toBe(0);
  });

  it(`the runtime role has the grants (Req 13.9, role ${RUNTIME_ROLE})`, async () => {
    const rows = (await client.query(
      `SELECT table_name, privilege_type FROM information_schema.role_table_grants
       WHERE grantee = $1 AND table_schema = 'public' AND table_name = ANY($2)`,
      [RUNTIME_ROLE, ["webhooks", "webhook_deliveries"]],
    )) as { table_name: string; privilege_type: string }[];
    for (const table of ["webhooks", "webhook_deliveries"]) {
      const granted = rows.filter((r) => r.table_name === table).map((r) => r.privilege_type).sort();
      expect(granted, table).toEqual(["DELETE", "INSERT", "SELECT", "UPDATE"]);
    }
  });
});

describe.skipIf(!ddlAllowed)("webhooks migration round trip on the Phase 2 Neon branch (destructive DDL)", () => {
  const snapshotQueries: Record<string, string> = {
    columns: `SELECT table_name, column_name, ordinal_position, data_type, is_nullable, column_default
      FROM information_schema.columns WHERE table_schema = 'public' ORDER BY 1, 3`,
    constraints: `SELECT c.conrelid::regclass::text AS table_name, c.conname, c.contype, pg_get_constraintdef(c.oid) AS def
      FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_namespace n ON n.oid = c.connamespace
      WHERE n.nspname = 'public' ORDER BY 1, 2`,
    indexes: `SELECT tablename, indexname, indexdef FROM pg_catalog.pg_indexes WHERE schemaname = 'public' ORDER BY 1, 2`,
    triggers: `SELECT tgrelid::regclass::text AS table_name, tgname, pg_get_triggerdef(oid) AS def
      FROM pg_catalog.pg_trigger WHERE NOT tgisinternal ORDER BY 1, 2`,
    functions: `SELECT p.proname, pg_get_functiondef(p.oid) AS def FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' ORDER BY 1`,
  };

  it("down then 0004 again restores an identical schema snapshot (Req 4.7)", async () => {
    const client = neon(DATABASE_URL as string);
    const run = async (statements: readonly string[]) => {
      for (const s of statements) await client.query(s);
    };
    const snapshot = async () => {
      const out: Record<string, unknown> = {};
      for (const [name, text] of Object.entries(snapshotQueries)) out[name] = await client.query(text);
      return out;
    };
    const tablesExist = async () =>
      ((await client.query(
        `SELECT count(*)::int AS n FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name IN ('webhooks','webhook_deliveries')`,
      )) as { n: number }[])[0]?.n === 2;
    const roleHadGrants = async () =>
      ((await client.query(
        `SELECT count(*)::int AS n FROM information_schema.role_table_grants
         WHERE grantee = $1 AND table_schema = 'public' AND table_name = 'webhooks'`,
        [RUNTIME_ROLE],
      )) as { n: number }[])[0]?.n !== 0;

    expect(await tablesExist(), "0004 must be applied before this test").toBe(true);
    const hadGrants = await roleHadGrants();
    const before = await snapshot();
    try {
      await run(downStatements());
      expect(await tablesExist()).toBe(false);
      await run(upStatements());
      expect(await snapshot()).toEqual(before);
    } finally {
      if (!(await tablesExist())) await run(upStatements());
      if (hadGrants && /^[a-z_][a-z0-9_]*$/i.test(RUNTIME_ROLE)) {
        await client.query(
          `GRANT SELECT, INSERT, UPDATE, DELETE ON "webhooks", "webhook_deliveries" TO "${RUNTIME_ROLE}"`,
        );
      }
    }
  }, 120_000);
});
