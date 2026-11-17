import { describe, expect, it } from "vitest";
import { parseFaaBody, parseFaaResponse } from "../src/schemas";
import { isMonitoredId } from "../src/airports";
import { deriveFaaEventId, normalizeResponse } from "../src/normalize";
import { SnapshotSchema } from "../src/schemas";
import liveFixture from "./fixtures/airport-events-live.json";
import populatedFixture from "./fixtures/ground-stop-populated.json";

const CAPTURED = "2025-06-01T18:05:00.000Z";
const SNAP_ID = "11111111-1111-4111-8111-111111111111";

describe("FAA fixtures", () => {
  it("parses the live-shape fixture; every groundStop is null", () => {
    const r = parseFaaResponse(liveFixture);
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(r.response).toHaveLength(11);
    expect(r.response.every((e) => e.groundStop == null)).toBe(true);
  });

  it("normalizes the live fixture to 20 airports, none with a ground stop, foreign ids dropped", () => {
    const r = parseFaaResponse(liveFixture);
    if (r.kind !== "ok") throw new Error("fixture should parse");
    const snap = normalizeResponse(r.response, CAPTURED, SNAP_ID, null);
    expect(SnapshotSchema.safeParse(snap).success).toBe(true);
    expect(snap.airports).toHaveLength(20);
    expect(snap.airports.every((a) => a.groundStop === null)).toBe(true);
    expect(snap.airports.every((a) => isMonitoredId(a.airportId))).toBe(true);
    expect(r.response.filter((e) => !isMonitoredId(e.airportId)).length).toBe(7);
  });

  it("derives the expected FAA_Event_ID for id, startTime-only, and neither", () => {
    const r = parseFaaResponse(populatedFixture);
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    const snap = normalizeResponse(r.response, CAPTURED, SNAP_ID, null);
    const gs = (id: string) => snap.airports.find((a) => a.airportId === id)?.groundStop;

    expect(gs("ATL")).toMatchObject({
      faaEventId: "faa:4521",
      idSource: "faa_id",
      reason: "THUNDERSTORMS",
      center: "ZTL",
      endTime: "2025-06-01T19:30:00Z",
    });
    expect(gs("BOS")).toMatchObject({
      faaEventId: "start:BOS:2025-06-01T18:30:00.000Z",
      idSource: "start_time",
      endTime: null,
    });
    expect(gs("DEN")).toMatchObject({
      faaEventId: `seen:DEN:${CAPTURED}`,
      idSource: "first_seen",
      reason: null,
      center: null,
    });
  });

  it("derives the same ids directly from the parsed ground stops", () => {
    const r = parseFaaResponse(populatedFixture);
    if (r.kind !== "ok") throw new Error("fixture should parse");
    const [atl, bos, den] = r.response;
    expect(deriveFaaEventId("ATL", atl?.groundStop ?? {}, CAPTURED, null).faaEventId).toBe("faa:4521");
    expect(deriveFaaEventId("BOS", bos?.groundStop ?? {}, CAPTURED, null).faaEventId).toBe(
      "start:BOS:2025-06-01T18:30:00.000Z",
    );
    expect(deriveFaaEventId("DEN", den?.groundStop ?? {}, CAPTURED, null).faaEventId).toBe(
      `seen:DEN:${CAPTURED}`,
    );
  });
});

describe("parseFaaBody", () => {
  it("returns unparseable for invalid JSON and the empty string", () => {
    expect(parseFaaBody("{not json").kind).toBe("unparseable");
    expect(parseFaaBody("").kind).toBe("unparseable");
  });

  it("returns validation with issue detail for a wrong shape", () => {
    const r = parseFaaBody(JSON.stringify({ airports: [] }));
    expect(r.kind).toBe("validation");
    if (r.kind === "validation") {
      expect(r.issues.length).toBeGreaterThan(0);
      expect(r.detail.length).toBeGreaterThan(0);
    }
    expect(parseFaaBody(JSON.stringify([{ airportLongName: "x" }])).kind).toBe("validation");
  });

  it("accepts an empty array", () => {
    expect(parseFaaBody("[]")).toEqual({ kind: "ok", response: [] });
  });

  it("accepts a ground stop with no inner fields", () => {
    const r = parseFaaBody(JSON.stringify([{ airportId: "ATL", groundStop: {} }]));
    expect(r.kind).toBe("ok");
  });

  it("strips unknown keys", () => {
    const body = JSON.stringify([
      { airportId: "ATL", latitude: "1", groundStop: { id: 7, advisoryUrl: "u" }, groundDelay: null },
    ]);
    const r = parseFaaBody(body);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") {
      expect(r.response).toEqual([{ airportId: "ATL", groundStop: { id: 7 } }]);
    }
  });
});
