/// <reference types="vite/client" />
import { AIRPORTS } from "@aerobrief/core";
import { describe, expect, it } from "vitest";

const sqlFiles = import.meta.glob<string>("../migrations/**/*.sql", {
  query: "?raw",
  import: "default",
  eager: true,
});
const journalFiles = import.meta.glob<string>("../migrations/meta/_journal.json", {
  query: "?raw",
  import: "default",
  eager: true,
});

const read = (rel: string): string => {
  const text = sqlFiles[`../migrations/${rel}`];
  if (text === undefined) throw new Error(`file not found: ${rel}`);
  return text;
};

const up = read("0006_watchlist_cap_30.sql");
const down = read("down/0006_watchlist_cap_30.down.sql");

/** The Legacy 20 codes, written out so the test does not derive them from the list under test. */
const LEGACY_20 = [
  "ATL", "BOS", "DCA", "DEN", "DFW", "DTW", "EWR", "IAH", "JFK", "LAS",
  "LAX", "MCO", "MEM", "MIA", "MSP", "ORD", "PHX", "SEA", "SFO", "SLC",
];
const newAirports = AIRPORTS.filter((a) => !LEGACY_20.includes(a.id));

describe("migration 0006_watchlist_cap_30.sql", () => {
  it("inserts exactly the New_Airports with registry name and artcc", () => {
    expect(newAirports).toHaveLength(10);
    const rows = [...up.matchAll(/^\s+\('([A-Z]{3})', '((?:[^']|'')*)', '([A-Z]{3})'\)/gm)].map((m) => ({
      id: m[1],
      name: (m[2] ?? "").replace(/''/g, "'"),
      artcc: m[3],
    }));
    expect(rows).toEqual(newAirports.map((a) => ({ id: a.id, name: a.name, artcc: a.artcc })));
  });

  it("uses ON CONFLICT (id) DO NOTHING", () => {
    expect(up).toContain('ON CONFLICT ("id") DO NOTHING;');
  });

  it("replaces the cap function with 30, its message and SQLSTATE 23514", () => {
    expect(up).toContain("CREATE OR REPLACE FUNCTION enforce_subscription_cap()");
    expect(up).toContain(">= 30");
    expect(up).toContain("subscription limit of 30 reached");
    expect(up).toContain("ERRCODE = '23514'");
    expect(up).not.toContain(">= 10");
  });
});

describe("down/0006_watchlist_cap_30.down.sql", () => {
  it("restores the cap of 10 with its message", () => {
    expect(down).toContain(">= 10");
    expect(down).toContain("subscription limit of 10 reached");
    expect(down).toContain("ERRCODE = '23514'");
  });

  it("deletes 30-airport snapshots, New_Airport events and unwatched New_Airports", () => {
    expect(down).toContain('DELETE FROM "snapshots" WHERE jsonb_array_length("airports") <> 20;');
    expect(down).toMatch(/DELETE FROM "events" WHERE "airport_id" IN \(/);
    expect(down).toMatch(/DELETE FROM "airports" a WHERE a\."id" IN \(/);
    expect(down).toContain('NOT EXISTS (SELECT 1 FROM "subscriptions" s WHERE s."airport_id" = a."id")');
    for (const a of newAirports) expect(down).toContain(`'${a.id}'`);
    for (const id of LEGACY_20) expect(down).not.toContain(`'${id}'`);
  });

  it("never deletes subscriptions, users or alert_log rows", () => {
    expect(down).not.toContain('DELETE FROM "subscriptions"');
    expect(down).not.toContain('DELETE FROM "users"');
    expect(down).not.toContain('DELETE FROM "alert_log"');
  });
});

describe("migration journal", () => {
  it("lists 0006_watchlist_cap_30 after 0005 and does not list the down file", () => {
    const raw = journalFiles["../migrations/meta/_journal.json"];
    if (raw === undefined) throw new Error("journal not found");
    const journal = JSON.parse(raw) as { entries: { idx: number; tag: string }[] };
    const entry = journal.entries.find((e) => e.tag === "0006_watchlist_cap_30");
    expect(entry).toBeDefined();
    expect(entry?.idx).toBe(6);
    expect(journal.entries.at(-1)?.tag).toBe("0006_watchlist_cap_30");
    expect(journal.entries.some((e) => e.tag.includes("down"))).toBe(false);
  });
});
