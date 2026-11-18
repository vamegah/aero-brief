import { describe, expect, it } from "vitest";
import { acceptAdvisoryUrl } from "../src/advisory-url";
import { normalizeResponse } from "../src/normalize";
import { SnapshotSchema, type FaaResponse } from "../src/schemas";

const ID = "11111111-1111-4111-8111-111111111111";
const T = "2025-01-01T12:00:00.000Z";

const stop = (gs: NonNullable<FaaResponse[number]["groundStop"]>) =>
  normalizeResponse([{ airportId: "ATL", groundStop: gs }], T, ID, null).airports.find((a) => a.airportId === "ATL")!
    .groundStop!;

describe("acceptAdvisoryUrl", () => {
  it("accepts https faa.gov and subdomains, trimming whitespace", () => {
    expect(acceptAdvisoryUrl("https://faa.gov/a")).toBe("https://faa.gov/a");
    expect(acceptAdvisoryUrl("  https://www.fly.FAA.gov/adv?x=1 ")).toBe("https://www.fly.faa.gov/adv?x=1");
  });

  it.each([
    "http://www.faa.gov/a",
    "javascript:alert(1)",
    "https://faa.gov.example.com/",
    "https://evilfaa.gov/",
    "https://faa.gov@evil.com/",
    "https://user:pw@faa.gov/",
    "ftp://faa.gov/",
    "not a url",
    "",
    "https://faa.gov/" + "a".repeat(2100),
  ])("rejects %s", (raw) => {
    expect(acceptAdvisoryUrl(raw)).toBeNull();
  });

  it("rejects non-strings", () => {
    expect(acceptAdvisoryUrl(undefined)).toBeNull();
    expect(acceptAdvisoryUrl(null)).toBeNull();
    expect(acceptAdvisoryUrl(42)).toBeNull();
  });
});

describe("normalization of expectedEnd and advisoryUrl", () => {
  it("uses endTime, as ISO UTC with milliseconds", () => {
    const s = stop({ id: 1, endTime: "2025-06-01T19:30:00Z", programExpirationTime: "2025-06-01T20:00:00Z" });
    expect(s.expectedEnd).toBe("2025-06-01T19:30:00.000Z");
  });

  it("falls back to programExpirationTime when endTime is missing or unparseable", () => {
    expect(stop({ id: 1, programExpirationTime: "2025-06-01T20:00:00Z" }).expectedEnd).toBe("2025-06-01T20:00:00.000Z");
    expect(stop({ id: 1, endTime: "garbage", programExpirationTime: "2025-06-01T20:00:00Z" }).expectedEnd).toBe(
      "2025-06-01T20:00:00.000Z",
    );
  });

  it("is null when neither parses, without failing", () => {
    expect(stop({ id: 1, endTime: "x", programExpirationTime: "y" }).expectedEnd).toBeNull();
    expect(stop({ id: 1 }).expectedEnd).toBeNull();
  });

  it("keeps a safe advisoryUrl and drops an unsafe one", () => {
    expect(stop({ id: 1, advisoryUrl: "https://www.fly.faa.gov/adv" }).advisoryUrl).toBe("https://www.fly.faa.gov/adv");
    expect(stop({ id: 1, advisoryUrl: "https://example.invalid/advzy" }).advisoryUrl).toBeNull();
    expect(stop({ id: 1 }).advisoryUrl).toBeNull();
  });

  it("parses old stored Snapshots without the new keys, defaulting to null", () => {
    const snap = normalizeResponse([{ airportId: "ATL", groundStop: { id: 1 } }], T, ID, null);
    const old = JSON.parse(JSON.stringify(snap)) as { airports: { groundStop: Record<string, unknown> | null }[] };
    for (const a of old.airports) {
      if (a.groundStop) {
        delete a.groundStop["expectedEnd"];
        delete a.groundStop["advisoryUrl"];
      }
    }
    const parsed = SnapshotSchema.parse(old);
    const atl = parsed.airports.find((a) => a.airportId === "ATL")!.groundStop!;
    expect(atl.expectedEnd).toBeNull();
    expect(atl.advisoryUrl).toBeNull();
  });
});
