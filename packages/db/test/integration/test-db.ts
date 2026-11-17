import { MONITORED_IDS, type Snapshot } from "@aerobrief/core";
import { airports, createDb, users, type Db } from "@aerobrief/db";
import { eq } from "drizzle-orm";

// The root tsconfig has no Node types (by choice), so declare only what is read here.
declare const process: { readonly env: Readonly<Record<string, string | undefined>> };

/**
 * Integration tests run only against a dedicated, already migrated test database (for example a
 * Neon branch). They never read DATABASE_URL, and refuse to run if both URLs are the same.
 */
export const TEST_DATABASE_URL: string | undefined = process.env["TEST_DATABASE_URL"]?.trim() || undefined;

export const hasTestDb = TEST_DATABASE_URL !== undefined;

export function connectTestDb(): Db {
  if (TEST_DATABASE_URL === undefined) throw new Error("TEST_DATABASE_URL is not set");
  const prod = process.env["DATABASE_URL"]?.trim();
  if (prod !== undefined && prod === TEST_DATABASE_URL) {
    throw new Error("TEST_DATABASE_URL must not equal DATABASE_URL");
  }
  return createDb(TEST_DATABASE_URL);
}

export function makeSnapshot(capturedAt: Date): Snapshot {
  return {
    id: crypto.randomUUID(),
    capturedAt: capturedAt.toISOString(),
    airports: MONITORED_IDS.map((airportId) => ({ airportId, groundStop: null })),
  };
}

export const uniqueEmail = (label: string) => `it-${label}-${crypto.randomUUID()}@example.test`;

export async function createUser(db: Db, label: string) {
  const [row] = await db.insert(users).values({ email: uniqueEmail(label) }).returning();
  if (row === undefined) throw new Error("user insert returned no row");
  return row;
}

export async function deleteUserById(db: Db, id: string): Promise<void> {
  await db.delete(users).where(eq(users.id, id));
}

/** Airport ids seeded by migration 0002. */
export async function seededAirportIds(db: Db): Promise<string[]> {
  const rows = await db.select({ id: airports.id }).from(airports).orderBy(airports.id);
  return rows.map((r) => r.id);
}
