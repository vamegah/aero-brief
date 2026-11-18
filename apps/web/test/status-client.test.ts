import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchNationalStatus, isNationalStatusResponse } from "../src/api/client";

function body(groundStop: unknown): unknown {
  return {
    state: "ok",
    capturedAt: "2026-01-02T12:00:00.000Z",
    stale: false,
    airports: [{ airportId: "JFK", name: "New York JFK", groundStop }],
    nationwide: { active: false, count: 0, artccs: [], explanation: null },
    events: [],
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("airport ground stop validation", () => {
  it("accepts a ground stop without the new fields", () => {
    expect(isNationalStatusResponse(body({ reasonText: "Wind" }))).toBe(true);
  });

  it("accepts string or null expectedEnd and advisoryUrl", () => {
    expect(
      isNationalStatusResponse(body({ reasonText: "Wind", expectedEnd: "2026-01-02T14:00:00.000Z", advisoryUrl: "https://x.gov/a" })),
    ).toBe(true);
    expect(isNationalStatusResponse(body({ reasonText: "Wind", expectedEnd: null, advisoryUrl: null }))).toBe(true);
  });

  it("rejects wrong types", () => {
    expect(isNationalStatusResponse(body({ reasonText: "Wind", expectedEnd: 5 }))).toBe(false);
    expect(isNationalStatusResponse(body({ reasonText: "Wind", advisoryUrl: 7 }))).toBe(false);
  });
});

describe("fetchNationalStatus normalization", () => {
  async function fetchWith(groundStop: unknown) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(body(groundStop)), { status: 200 })),
    );
    const res = await fetchNationalStatus();
    if (res.state !== "ok") throw new Error("expected ok");
    return res.airports[0]?.groundStop;
  }

  it("fills missing fields with null", async () => {
    expect(await fetchWith({ reasonText: "Wind" })).toEqual({ reasonText: "Wind", expectedEnd: null, advisoryUrl: null });
  });

  it("preserves provided values", async () => {
    const gs = { reasonText: "Wind", expectedEnd: "2026-01-02T14:00:00.000Z", advisoryUrl: "https://x.gov/a" };
    expect(await fetchWith(gs)).toEqual(gs);
  });
});
