import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { airportById, artccOf, MONITORED_IDS } from "../src/airports";
import type { DetectedEvent } from "../src/change-detector";
import { explain } from "../src/explain";
import { webhookPayloadSchema } from "../src/schemas/webhook-payload";
import { buildTestPayload, buildWebhookPayload } from "../src/webhooks/payload";
import { airportIdArb, isoTimestampArb } from "./arbitraries";

const MAX_PAYLOAD_BYTES = 4096;
const CONTROL = /[\u0000-\u001F\u007F-\u009F\u2028\u2029]/;
const NUM_RUNS = 200;

/** Strings with &, <, >, quotes, backslashes, control characters and non-ASCII text. */
const hostileStringArb: fc.Arbitrary<string> = fc.oneof(
  fc.string({ maxLength: 300, unit: "binary" }),
  fc.array(
    fc.constantFrom(
      "&", "<", ">", '"', "'", "\\", "\n", "\r", "\t", "\u0000", "\u001f", "\u007f", "\u0085",
      "\u2028", "\u2029", "&amp;", "&lt;", "</script>", "é", "日本語", "\u{1F6EB}", "\u202e",
    ),
    { maxLength: 150 },
  ).map((a) => a.join("")),
);

/** Hostile text that always keeps at least one printable character. */
const hostileKeyArb: fc.Arbitrary<string> = hostileStringArb.map((s) => `K${s}`);

const reasonArb: fc.Arbitrary<string | null> = fc.oneof(
  fc.constant(null),
  hostileStringArb,
  fc.constantFrom("wind", "Thunderstorms ", "FOG", "volume"),
);

const eventArb: fc.Arbitrary<DetectedEvent> = fc.oneof(
  fc.record({
    type: fc.constantFrom("GROUND_STOP_STARTED" as const, "GROUND_STOP_ENDED" as const),
    airportId: airportIdArb,
    occurredAt: isoTimestampArb,
    faaEventId: hostileKeyArb,
    reason: reasonArb,
  }),
  fc
    .record({
      occurredAt: isoTimestampArb,
      ids: fc.uniqueArray(fc.constantFrom(...MONITORED_IDS), { minLength: 1, maxLength: 20 }),
    })
    .map(({ occurredAt, ids }): DetectedEvent => {
      const artccs = [...new Set(ids.map(artccOf))].sort();
      return { type: "NATIONWIDE_EVENT", occurredAt, count: artccs.length, affectedArtccs: artccs };
    }),
);

const keyOverrideArb = fc.option(hostileKeyArb, { nil: undefined });

function stripControl(s: string): string {
  return s.replace(/[\u0000-\u001F\u007F-\u009F\u2028\u2029]/g, "");
}

function escaped(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

describe("webhook payload", () => {
  describe("Property 19: Payload validity and size", () => {
    // Feature: aerobrief-phase2, Property 19: Payload validity and size
    // **Validates: Requirements 15.1, 17.1, 17.4, 17.5, 17.6, 17.8**
    it("built payload is schema-valid, at most 4096 bytes, single-line, escaped and faithful", () => {
      fc.assert(
        fc.property(eventArb, fc.uuid(), keyOverrideArb, (event, deliveryId, keyOverride) => {
          const payload = buildWebhookPayload(event, deliveryId, keyOverride);

          // Valid against the schema, and the id is the Delivery_ID.
          const parsed = webhookPayloadSchema.safeParse(payload);
          expect(parsed.success).toBe(true);
          expect(payload.id).toBe(deliveryId);

          // Serialized size within the limit.
          const bytes = new TextEncoder().encode(JSON.stringify(payload)).length;
          expect(bytes).toBeLessThanOrEqual(MAX_PAYLOAD_BYTES);

          // text: single line, no control characters, only escaped &, <, >.
          expect(payload.text).not.toMatch(CONTROL);
          expect(payload.text).not.toMatch(/\s{2,}/);
          expect(payload.text).toBe(payload.text.trim());
          const withoutEscapes = payload.text
            .replace(/&amp;/g, "")
            .replace(/&lt;/g, "")
            .replace(/&gt;/g, "");
          expect(withoutEscapes).not.toMatch(/[&<>]/);

          // text names the airport, or says "nationwide".
          if (event.type === "NATIONWIDE_EVENT") {
            expect(payload.text.toLowerCase()).toContain("nationwide");
          } else {
            expect(payload.text).toContain(escaped(airportById(event.airportId).name));
          }

          // data.explanation: only control characters stripped and the 400 cap applied.
          const stripped = stripControl(explain(event));
          const chars = Array.from(stripped);
          const expected = chars.length <= 400 ? stripped : chars.slice(0, 399).join("") + "\u2026";
          if (payload.type === "TEST") throw new Error("unexpected TEST payload for an event");
          expect(payload.data.explanation).toBe(expected);
          expect(payload.data.explanation).not.toMatch(CONTROL);
        }),
        { numRuns: NUM_RUNS },
      );
    });
  });

  describe("Property 20: Payload JSON round trip", () => {
    // Feature: aerobrief-phase2, Property 20: Payload JSON round trip
    // **Validates: Requirements 17.9**
    it("parsing JSON.stringify(payload) with the schema returns an equal payload, TEST included", () => {
      const roundTrips = (p: unknown) => {
        const parsed = webhookPayloadSchema.safeParse(JSON.parse(JSON.stringify(p)));
        expect(parsed.success).toBe(true);
        if (parsed.success) expect(parsed.data).toEqual(p);
      };
      fc.assert(
        fc.property(eventArb, fc.uuid(), keyOverrideArb, (event, deliveryId, keyOverride) => {
          roundTrips(buildWebhookPayload(event, deliveryId, keyOverride));
        }),
        { numRuns: NUM_RUNS },
      );
      fc.assert(
        fc.property(fc.uuid(), fc.date({ min: new Date("2000-01-01T00:00:00.000Z"), max: new Date("2100-01-01T00:00:00.000Z"), noInvalidDate: true }), (deliveryId, now) => {
          const p = buildTestPayload(deliveryId, now);
          expect(p.type).toBe("TEST");
          roundTrips(p);
        }),
        { numRuns: NUM_RUNS },
      );
    });
  });
});
