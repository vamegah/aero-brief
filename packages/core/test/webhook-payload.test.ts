import { describe, expect, test } from "vitest";
import type { GroundStopEvent, NationwideEvent } from "../src/change-detector";
import { webhookPayloadSchema } from "../src/schemas/webhook-payload";
import { buildTestPayload, buildWebhookPayload } from "../src/webhooks/payload";

const ID = "123e4567-e89b-42d3-a456-426614174000";
const started: GroundStopEvent = {
  type: "GROUND_STOP_STARTED",
  airportId: "EWR",
  occurredAt: "2026-11-13T14:32:45.000Z",
  faaEventId: "faa-1",
  reason: "wind",
};
const nationwide: NationwideEvent = {
  type: "NATIONWIDE_EVENT",
  occurredAt: "2026-11-13T14:32:45.000Z",
  count: 8,
  affectedArtccs: ["ZNY", "ZBW", "ZDC", "ZTL", "ZJX", "ZMA", "ZID", "ZOB"],
};

describe("buildWebhookPayload", () => {
  test("ground stop started passes the schema and has the expected fields", () => {
    const p = buildWebhookPayload(started, ID);
    expect(webhookPayloadSchema.parse(p)).toEqual(p);
    expect(p.type).toBe("ground_stop.started");
    expect(p.id).toBe(ID);
    expect(p.text.startsWith("Ground stop started at ")).toBe(true);
    expect(p.text.endsWith("(14:32 UTC)")).toBe(true);
    if (p.type === "TEST") throw new Error("unexpected");
    expect(p.data.airportId).toBe("EWR");
    expect(p.data.eventKey).toBe("faa-1");
    expect(p.data.eventTime).toBe("2026-11-13T14:32:45.000Z");
  });

  test("ended type maps to ground_stop.ended", () => {
    expect(buildWebhookPayload({ ...started, type: "GROUND_STOP_ENDED" }, ID).type).toBe(
      "ground_stop.ended",
    );
  });

  test("nationwide payload has null airport and says nationwide", () => {
    const p = buildWebhookPayload(nationwide, ID);
    expect(webhookPayloadSchema.parse(p)).toEqual(p);
    expect(p.type).toBe("nationwide.event");
    if (p.type === "TEST") throw new Error("unexpected");
    expect(p.data.airportId).toBeNull();
    expect(p.data.airportName).toBeNull();
    expect(p.text.toLowerCase()).toContain("nationwide");
    expect(JSON.stringify(p).length).toBeLessThanOrEqual(4096);
  });

  test("text is one line, escaped, and cut explanation stays within 200 characters", () => {
    const p = buildWebhookPayload(nationwide, ID);
    expect(p.text).not.toMatch(/[\r\n\t]/);
    expect(p.text).not.toMatch(/[<>]|&(?!amp;|lt;|gt;)/);
    // The nationwide explanation is longer than 200 characters, so text holds an ellipsis.
    expect(p.text).toContain("\u2026");
  });

  test("escaping applies to text only, not data", () => {
    const p = buildWebhookPayload(started, ID, "a&b<c>\n\u0000d");
    if (p.type === "TEST") throw new Error("unexpected");
    expect(p.data.eventKey).toBe("a&b<c>d");
    expect(buildTestPayload(ID, new Date()).text).not.toContain("<");
  });
});

describe("code point cuts respect the schema's UTF-16 limits", () => {
  test("an eventKey of 120 emoji parses and keeps whole characters", () => {
    const p = buildWebhookPayload(started, ID, "\u{1F6EB}".repeat(120));
    expect(webhookPayloadSchema.safeParse(p).success).toBe(true);
    if (p.type === "TEST") throw new Error("unexpected");
    expect(p.data.eventKey.length).toBeLessThanOrEqual(100);
    expect(p.data.eventKey.endsWith("\u2026")).toBe(true);
    expect(p.data.eventKey).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
  });

  test("an event key of 100 BMP characters is kept as is", () => {
    const key = "k".repeat(100);
    const p = buildWebhookPayload(started, ID, key);
    if (p.type === "TEST") throw new Error("unexpected");
    expect(p.data.eventKey).toBe(key);
  });

  test("astral text in the reason keeps explanation and text within the schema", () => {
    const p = buildWebhookPayload({ ...started, reason: "\u{1F6EB}".repeat(500) }, ID);
    expect(webhookPayloadSchema.safeParse(p).success).toBe(true);
  });
});

describe("buildTestPayload", () => {
  test("starts with TEST:, states no real disruption, passes the schema", () => {
    const p = buildTestPayload(ID, new Date("2026-11-13T09:05:00.000Z"));
    expect(webhookPayloadSchema.parse(p)).toEqual(p);
    expect(p.type).toBe("TEST");
    expect(p.text.startsWith("TEST:")).toBe(true);
    expect(p.text).toContain("No real disruption occurred");
    expect(p.text.endsWith("(09:05 UTC)")).toBe(true);
    expect(p.id).toBe(ID);
    if (p.type !== "TEST") throw new Error("unexpected");
    expect(p.data.test).toBe(true);
  });
});

describe("webhookPayloadSchema", () => {
  test("rejects extra fields, bad type and over-limit fields", () => {
    const good = buildWebhookPayload(started, ID);
    expect(webhookPayloadSchema.safeParse({ ...good, blocks: [] }).success).toBe(false);
    expect(webhookPayloadSchema.safeParse({ ...good, type: "other" }).success).toBe(false);
    if (good.type === "TEST") throw new Error("unexpected");
    const long = { ...good, data: { ...good.data, explanation: "x".repeat(401) } };
    expect(webhookPayloadSchema.safeParse(long).success).toBe(false);
    const name = { ...good, data: { ...good.data, airportName: "x".repeat(81) } };
    expect(webhookPayloadSchema.safeParse(name).success).toBe(false);
    const key = { ...good, data: { ...good.data, eventKey: "x".repeat(101) } };
    expect(webhookPayloadSchema.safeParse(key).success).toBe(false);
  });
});
