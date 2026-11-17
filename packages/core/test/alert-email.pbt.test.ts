import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { composeAlertEmail, type AlertEventType } from "../src/alert-email";
import { airportIdArb, genericStringArb, isoTimestampArb, tokenArb } from "./arbitraries";

/**
 * Feature: aerobrief, Property 17: Alert email content
 * For any Event and Explanation text, the plain-text body contains the airport name,
 * the Event type, the Explanation verbatim, and the Event time as UTC to the minute.
 * Ground stop emails contain an unsubscribe link naming the airport.
 *
 * **Validates: Requirements 5.8, 9.2, 9.8**
 */

const LABELS: Record<AlertEventType, string> = {
  GROUND_STOP_STARTED: "Ground stop started",
  GROUND_STOP_ENDED: "Ground stop ended",
  NATIONWIDE_EVENT: "Nationwide event",
};

const airportNameArb = fc.string({ minLength: 1, maxLength: 40 });
const frontendUrlArb = fc.constantFrom("https://aerobrief.example.com", "https://aerobrief.example.com/", "http://localhost:5173");

const groundStopInputArb = fc.record({
  eventType: fc.constantFrom<"GROUND_STOP_STARTED" | "GROUND_STOP_ENDED">("GROUND_STOP_STARTED", "GROUND_STOP_ENDED"),
  airportName: airportNameArb,
  explanation: genericStringArb,
  occurredAt: isoTimestampArb,
  airportId: airportIdArb,
  userId: fc.uuid(),
  sig: tokenArb,
  frontendUrl: frontendUrlArb,
});

describe("Property 17: Alert email content", () => {
  it("ground stop text contains airport, event type, explanation, UTC minute time and unsubscribe link naming the airport", () => {
    fc.assert(
      fc.property(groundStopInputArb, (g) => {
        const email = composeAlertEmail({
          eventType: g.eventType,
          airportName: g.airportName,
          explanation: g.explanation,
          occurredAt: g.occurredAt,
          unsubscribe: { frontendUrl: g.frontendUrl, userId: g.userId, airportId: g.airportId, sig: g.sig },
        });
        const utcMinute = `${g.occurredAt.slice(0, 10)} ${g.occurredAt.slice(11, 16)} UTC`;
        expect(email.text).toContain(g.airportName);
        expect(email.text).toContain(LABELS[g.eventType]);
        expect(email.text).toContain(g.explanation);
        expect(email.text).toContain(utcMinute);
        expect(email.text).toContain(`/unsubscribe?u=${encodeURIComponent(g.userId)}&a=${encodeURIComponent(g.airportId)}`);
      }),
      { numRuns: 200 },
    );
  });

  it("nationwide text contains event type, explanation and UTC minute time, and no unsubscribe link", () => {
    fc.assert(
      fc.property(
        genericStringArb,
        isoTimestampArb,
        fc.option(airportNameArb, { nil: undefined }),
        (explanation, occurredAt, airportName) => {
          const email = composeAlertEmail({ eventType: "NATIONWIDE_EVENT", explanation, occurredAt, airportName });
          const utcMinute = `${occurredAt.slice(0, 10)} ${occurredAt.slice(11, 16)} UTC`;
          expect(email.text).toContain(LABELS.NATIONWIDE_EVENT);
          expect(email.text).toContain(explanation);
          expect(email.text).toContain(utcMinute);
          if (airportName !== undefined) expect(email.text).toContain(airportName);
          expect(email.text).not.toContain("/unsubscribe");
        },
      ),
      { numRuns: 200 },
    );
  });
});
