import { z } from "zod";

/** Field limits from the design (webhook payload section). */
export const WEBHOOK_LIMITS = {
  airportName: 80,
  explanation: 400,
  eventKey: 100,
  text: 1500,
  note: 200,
} as const;

const eventDataSchema = z
  .object({
    eventKey: z.string().min(1).max(WEBHOOK_LIMITS.eventKey),
    airportId: z.string().min(1).max(8).nullable(),
    airportName: z.string().min(1).max(WEBHOOK_LIMITS.airportName).nullable(),
    eventTime: z.string().datetime(),
    explanation: z.string().min(1).max(WEBHOOK_LIMITS.explanation),
  })
  .strict();

function eventPayload<T extends "ground_stop.started" | "ground_stop.ended" | "nationwide.event">(
  type: T,
) {
  return z
    .object({
      id: z.string().uuid(),
      type: z.literal(type),
      createdAt: z.string().datetime(),
      data: eventDataSchema,
      text: z.string().min(1).max(WEBHOOK_LIMITS.text),
    })
    .strict();
}

const testPayloadSchema = z
  .object({
    id: z.string().uuid(),
    type: z.literal("TEST"),
    createdAt: z.string().datetime(),
    data: z
      .object({
        test: z.literal(true),
        note: z.string().min(1).max(WEBHOOK_LIMITS.note),
      })
      .strict(),
    text: z.string().min(1).max(WEBHOOK_LIMITS.text),
  })
  .strict();

/** Outbound webhook body. Discriminated on `type`; extra fields are rejected. */
export const webhookPayloadSchema = z.discriminatedUnion("type", [
  eventPayload("ground_stop.started"),
  eventPayload("ground_stop.ended"),
  eventPayload("nationwide.event"),
  testPayloadSchema,
]);

export type WebhookPayload = z.infer<typeof webhookPayloadSchema>;
