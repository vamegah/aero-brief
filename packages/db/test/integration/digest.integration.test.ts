/// <reference types="vite/client" />
/**
 * Neon branch integration tests for the daily digest (Phase 2 task 5.12; Requirements 4.7, 10.6, 11.5).
 *
 * The whole suite SKIPS, with no connection attempt, unless ALL of the following hold:
 *   - PHASE2_RUN_INTEGRATION_TESTS is exactly "true" (explicit opt-in),
 *   - PHASE2_DATABASE_URL is set to the OWNER role URL of the Phase 2 Neon branch. There is no fallback to
 *     DATABASE_URL, which is the runtime-role URL and would fail with "permission denied",
 *   - PHASE2_DB_HOST and PRODUCTION_DB_HOST are set, and
 *   - `assertPhase2Target(url, PHASE2_DB_HOST, PRODUCTION_DB_HOST)` passes.
 * The guard is a pure string check done when this file loads. It opens no connection, and no database
 * client is created at module level. The branch must already have migration 0005 applied and the 0005 grants.
 *
 * Command (PowerShell, on branch `phase-2`; variables must already be set to the Phase 2 branch):
 *   $env:NODE_OPTIONS = "--use-system-ca"; $env:PHASE2_RUN_INTEGRATION_TESTS = "true"; npx vitest --run packages/db/test/integration/digest.integration.test.ts
 * Add `$env:PHASE2_ALLOW_DDL_TESTS = "true"` to also run the destructive down/up test.
 *
 * Data tests create their own users (`it+<uuid>@example.invalid`) and delete them afterwards. They never
 * touch the seeded users or other rows.
 *
 * The down/up snapshot test is DESTRUCTIVE: it drops the digest tables (and their rows) with
 * migrations/down/0005_digest.down.sql and re-applies 0005. It runs only when PHASE2_ALLOW_DDL_TESTS=true,
 * and always restores 0005 (and the runtime grants, if they existed) in a finally block.
 *
 * Optional: RUNTIME_ROLE (default `aerobrief_runtime`) names the role the grants test checks.
 */
import { neon } from "@neondatabase/serverless";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { digestRepository } from "../../src/digest";
import { createDb, type Db } from "../../src/repositories/client";
import { assertPhase2Target, Phase2TargetError } from "../../src/phase2-target";
import { digestDeliveries, digestPreferences, users } from "../../src/schema";

declare const process: { readonly env: Readonly<Record<string, string | undefined>> };

const sqlFiles = import.meta.glob<string>(
  ["../../migrations/0005_digest.sql", "../../migrations/down/0005_digest.down.sql"],
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
      `digest.integration: skipped. ${e instanceof Phase2TargetError ? e.message : "target check failed"}`,
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
  sqlOf("0005_digest.sql")
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s !== "");
const downStatements = (): string[] =>
  sqlOf("0005_digest.down.sql")
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n")
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.trim())
    .filter((s) => s !== "");

describe.skipIf(!enabled)("digest on the Phase 2 Neon branch (integration)", () => {
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

  const prefCount = async (userId: string) =>
    (await db.select().from(digestPreferences).where(eq(digestPreferences.userId, userId))).length;
  const deliveryCount = async (userId: string) =>
    (await db.select().from(digestDeliveries).where(eq(digestDeliveries.userId, userId))).length;

  it("the claim with ON CONFLICT DO NOTHING succeeds once per User and date (Req 11.5)", async () => {
    const userId = await newUser();
    const repo = digestRepository(db);
    const now = new Date();

    expect(await repo.claim(userId, "2026-11-20", now)).toBe(true);
    expect(await repo.claim(userId, "2026-11-20", now)).toBe(false);
    // A different date for the same User is a separate claim.
    expect(await repo.claim(userId, "2026-11-21", now)).toBe(true);
    expect(await deliveryCount(userId)).toBe(2);
  });

  it("two concurrent claims for the same User and date yield exactly one true (Req 11.5)", async () => {
    const userId = await newUser();
    const repo = digestRepository(db);
    const now = new Date();

    const results = await Promise.all([
      repo.claim(userId, "2026-11-22", now),
      repo.claim(userId, "2026-11-22", now),
    ]);
    expect(results.filter((r) => r)).toHaveLength(1);
    expect(await deliveryCount(userId)).toBe(1);
  });

  it("upsertPreference and disable write and clear the preference", async () => {
    const userId = await newUser();
    const repo = digestRepository(db);
    const now = new Date();

    expect(await repo.disable(userId, now)).toBe(false);
    expect(await repo.upsertPreference({ userId, enabled: true, hour: 7 }, now)).toEqual({ enabled: true, hour: 7 });
    expect(await repo.upsertPreference({ userId, enabled: true, hour: 18 }, now)).toEqual({ enabled: true, hour: 18 });
    expect(await repo.disable(userId, now)).toBe(true);
    expect(await repo.getPreference(userId)).toEqual({ enabled: false, hour: 18 });
    expect(await prefCount(userId)).toBe(1);
  });

  it("deleting a User removes preferences and deliveries (Req 10.6)", async () => {
    const userId = await newUser();
    const repo = digestRepository(db);
    const now = new Date();
    await repo.upsertPreference({ userId, enabled: true, hour: 9 }, now);
    await repo.claim(userId, "2026-11-23", now);
    expect(await prefCount(userId)).toBe(1);
    expect(await deliveryCount(userId)).toBe(1);

    await db.delete(users).where(eq(users.id, userId));

    expect(await prefCount(userId)).toBe(0);
    expect(await deliveryCount(userId)).toBe(0);
  });

  it(`the runtime role has the grants (Req 10.6, role ${RUNTIME_ROLE})`, async () => {
    const rows = (await client.query(
      `SELECT table_name, privilege_type FROM information_schema.role_table_grants
       WHERE grantee = $1 AND table_schema = 'public' AND table_name = ANY($2)`,
      [RUNTIME_ROLE, ["digest_preferences", "digest_deliveries"]],
    )) as { table_name: string; privilege_type: string }[];
    for (const table of ["digest_preferences", "digest_deliveries"]) {
      const granted = rows.filter((r) => r.table_name === table).map((r) => r.privilege_type).sort();
      expect(granted, table).toEqual(["DELETE", "INSERT", "SELECT", "UPDATE"]);
    }
  });
});

describe.skipIf(!ddlAllowed)("digest migration round trip on the Phase 2 Neon branch (destructive DDL)", () => {
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

  it("down then 0005 again restores an identical schema snapshot (Req 4.7)", async () => {
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
         WHERE table_schema = 'public' AND table_name IN ('digest_preferences','digest_deliveries')`,
      )) as { n: number }[])[0]?.n === 2;
    const roleHadGrants = async () =>
      ((await client.query(
        `SELECT count(*)::int AS n FROM information_schema.role_table_grants
         WHERE grantee = $1 AND table_schema = 'public' AND table_name = 'digest_preferences'`,
        [RUNTIME_ROLE],
      )) as { n: number }[])[0]?.n !== 0;

    expect(await tablesExist(), "0005 must be applied before this test").toBe(true);
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
          `GRANT SELECT, INSERT, UPDATE, DELETE ON "digest_preferences", "digest_deliveries" TO "${RUNTIME_ROLE}"`,
        );
      }
    }
  }, 120_000);
});
