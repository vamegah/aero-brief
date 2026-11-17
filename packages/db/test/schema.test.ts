/// <reference types="vite/client" />
import { AIRPORTS } from "@aerobrief/core";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import * as schema from "../src/schema";
import { buildAirportRows, renderAirportsInsertSql } from "../src/seed";

const migrationFiles = import.meta.glob<string>("../migrations/*.sql", {
  query: "?raw",
  import: "default",
  eager: true,
});

const migration = (name: string): string => {
  const sql = migrationFiles[`../migrations/${name}`];
  if (sql === undefined) throw new Error(`migration not found: ${name}`);
  return sql;
};

const isPgTable = (v: unknown): v is PgTable => typeof v === "object" && v !== null && "getSQL" in v;

const tables = Object.values(schema).filter(isPgTable);

describe("schema: seed rows (Requirement 2.6)", () => {
  it("builds exactly the core airport list", () => {
    expect(buildAirportRows()).toEqual(AIRPORTS.map((a) => ({ id: a.id, name: a.name, artcc: a.artcc })));
    expect(buildAirportRows()).toHaveLength(20);
  });

  it("migration 0002 contains the rendered core-list INSERT verbatim", () => {
    expect(migration("0002_seed_airports.sql")).toContain(renderAirportsInsertSql());
  });
});

describe("schema: no passwords (Requirement 7.7)", () => {
  it("no table has a password-like column", () => {
    expect(tables.length).toBeGreaterThan(0);
    for (const table of tables) {
      for (const column of getTableConfig(table).columns) {
        expect(column.name).not.toMatch(/pass(word|wd)?|secret|credential/i);
      }
    }
  });

  it("the users table holds only id, email and created_at", () => {
    const names = getTableConfig(schema.users).columns.map((c) => c.name);
    expect(names.sort()).toEqual(["created_at", "email", "id"]);
  });

  it("migrations create no password column", () => {
    expect(migration("0000_init_schema.sql")).not.toMatch(/password/i);
  });
});

describe("schema: unique constraints (Requirement 9.10)", () => {
  const uniqueCols = (table: PgTable, name: string): string[] | undefined =>
    getTableConfig(table)
      .uniqueConstraints.find((u) => u.name === name)
      ?.columns.map((c) => c.name);

  it("events is unique on (event_key, type)", () => {
    expect(uniqueCols(schema.events, "events_event_key_type_unique")).toEqual(["event_key", "type"]);
    expect(migration("0000_init_schema.sql")).toContain(
      'CONSTRAINT "events_event_key_type_unique" UNIQUE("event_key","type")',
    );
  });

  it("alert_log is unique on (event_key, event_type, user_id)", () => {
    expect(uniqueCols(schema.alertLog, "alert_log_event_key_event_type_user_id_unique")).toEqual([
      "event_key",
      "event_type",
      "user_id",
    ]);
    expect(migration("0000_init_schema.sql")).toContain(
      'CONSTRAINT "alert_log_event_key_event_type_user_id_unique" UNIQUE("event_key","event_type","user_id")',
    );
  });
});
