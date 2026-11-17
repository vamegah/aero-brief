import { AIRPORTS } from "@aerobrief/core";

export type AirportSeedRow = { readonly id: string; readonly name: string; readonly artcc: string };

/** Rows for the `airports` table, built from the core list (the source of truth). */
export function buildAirportRows(): AirportSeedRow[] {
  return AIRPORTS.map((a) => ({ id: a.id, name: a.name, artcc: a.artcc }));
}

const sqlString = (v: string): string => `'${v.replace(/'/g, "''")}'`;

/**
 * Renders the exact INSERT statement stored in migrations/0002_seed_airports.sql.
 * A test can assert that file contains this string.
 */
export function renderAirportsInsertSql(rows: readonly AirportSeedRow[] = buildAirportRows()): string {
  const values = rows
    .map((r) => `  (${sqlString(r.id)}, ${sqlString(r.name)}, ${sqlString(r.artcc)})`)
    .join(",\n");
  return `INSERT INTO "airports" ("id", "name", "artcc") VALUES\n${values}\nON CONFLICT ("id") DO NOTHING;`;
}
