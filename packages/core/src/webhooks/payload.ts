import { airportById } from "../airports";
import type { DetectedEvent } from "../change-detector";
import { explain } from "../explain";
import { WEBHOOK_LIMITS, type WebhookPayload } from "../schemas/webhook-payload";

/** Max characters of the explanation inside `text`, ellipsis included. */
export const TEXT_EXPLANATION_MAX = 200;

const TEST_NOTE = "This is a test event from AeroBrief. No real disruption occurred.";

/** Removes C0/C1 control characters and line/paragraph separators. */
function stripControl(s: string): string {
  return s.replace(/[\u0000-\u001F\u007F-\u009F\u2028\u2029]/g, "");
}

/**
 * Cuts to at most `max` UTF-16 code units (the unit zod's `max` counts), ending in an
 * ellipsis when cut. Cuts on code point boundaries so a surrogate pair is never split.
 * Identical to a per-character cut for text in the Basic Multilingual Plane.
 */
function cut(s: string, max: number): string {
  if (s.length <= max) return s;
  let out = "";
  for (const ch of s) {
    if (out.length + ch.length > max - 1) break;
    out += ch;
  }
  return out + "\u2026";
}

function oneLine(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function toIso(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toISOString();
}

/** "14:32 UTC" from an ISO instant. */
function utcMinute(iso: string): string {
  return `${iso.slice(11, 16)} UTC`;
}

const TYPE_MAP = {
  GROUND_STOP_STARTED: "ground_stop.started",
  GROUND_STOP_ENDED: "ground_stop.ended",
  NATIONWIDE_EVENT: "nationwide.event",
} as const;

/**
 * Builds the webhook body for a detected event. Pure.
 * `eventKeyValue` defaults to the FAA_Event_ID (ground stops) or
 * `NATIONWIDE:<occurredAt>` (nationwide) when the caller has no key.
 */
export function buildWebhookPayload(
  event: DetectedEvent,
  deliveryId: string,
  eventKeyValue?: string,
): WebhookPayload {
  const eventTime = toIso(event.occurredAt);
  const rawExplanation = stripControl(explain(event));
  const explanation = cut(rawExplanation, WEBHOOK_LIMITS.explanation);

  let airportId: string | null = null;
  let airportName: string | null = null;
  let key: string;
  let lead: string;
  if (event.type === "NATIONWIDE_EVENT") {
    key = `NATIONWIDE:${eventTime}`;
    lead = "Nationwide ground stop";
  } else {
    const airport = airportById(event.airportId);
    airportId = airport.id;
    airportName = cut(stripControl(airport.name), WEBHOOK_LIMITS.airportName);
    key = event.faaEventId;
    const verb = event.type === "GROUND_STOP_STARTED" ? "started" : "ended";
    lead = `Ground stop ${verb} at ${airportName} (${airportId})`;
  }
  key = cut(stripControl(eventKeyValue ?? key), WEBHOOK_LIMITS.eventKey);

  const shortExplanation = cut(oneLine(rawExplanation), TEXT_EXPLANATION_MAX);
  const text = escapeText(oneLine(`${lead}: ${shortExplanation} (${utcMinute(eventTime)})`));

  return {
    id: deliveryId,
    type: TYPE_MAP[event.type],
    createdAt: eventTime,
    data: { eventKey: key, airportId, airportName, eventTime, explanation },
    text,
  };
}

/** Builds the `TEST` payload sent by the test endpoint. Pure. */
export function buildTestPayload(deliveryId: string, now: Date | string): WebhookPayload {
  const createdAt = toIso(now);
  return {
    id: deliveryId,
    type: "TEST",
    createdAt,
    data: { test: true, note: TEST_NOTE },
    text: escapeText(oneLine(`TEST: ${TEST_NOTE} (${utcMinute(createdAt)})`)),
  };
}
