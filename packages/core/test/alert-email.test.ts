import { describe, expect, it } from "vitest";
import { composeAlertEmail, escapeHtml, formatUtc } from "../src/alert-email";

const unsubscribe = { frontendUrl: "https://app.example.com", userId: "u 1", airportId: "KJFK", sig: "abc-_123" };

describe("formatUtc", () => {
  it("formats as YYYY-MM-DD HH:mm UTC", () => {
    expect(formatUtc("2025-03-04T05:06:07.890Z")).toBe("2025-03-04 05:06 UTC");
    expect(formatUtc("2025-03-04T05:06:00-05:00")).toBe("2025-03-04 10:06 UTC");
  });
});

describe("composeAlertEmail", () => {
  const explanation = `Ground stop at <JFK> & "friends" 'x'`;

  it("ground stop: text has verbatim explanation, name, type, time, and unsubscribe link", () => {
    const m = composeAlertEmail({
      eventType: "GROUND_STOP_STARTED",
      airportName: "John F. Kennedy International",
      explanation,
      occurredAt: "2025-03-04T05:06:07Z",
      unsubscribe,
    });
    expect(m.text).toContain(explanation);
    expect(m.text).toContain("John F. Kennedy International");
    expect(m.text).toContain("Ground stop started");
    expect(m.text).toContain("2025-03-04 05:06 UTC");
    expect(m.text).toContain("https://app.example.com/unsubscribe?u=u%201&a=KJFK&sig=abc-_123");
  });

  it("ground stop: html escapes the explanation and contains the link", () => {
    const m = composeAlertEmail({
      eventType: "GROUND_STOP_ENDED",
      airportName: "A & B",
      explanation,
      occurredAt: "2025-03-04T05:06:07Z",
      unsubscribe,
    });
    expect(m.html).toContain(escapeHtml(explanation));
    expect(m.html).not.toContain("<JFK>");
    expect(m.html).toContain("A &amp; B");
    expect(m.html).toContain("Ground stop ended");
    expect(m.html).toContain('href="https://app.example.com/unsubscribe?u=u%201&amp;a=KJFK&amp;sig=abc-_123"');
  });

  it("trims trailing slashes on frontendUrl", () => {
    const m = composeAlertEmail({
      eventType: "GROUND_STOP_STARTED",
      airportName: "X",
      explanation: "e",
      occurredAt: "2025-03-04T05:06:07Z",
      unsubscribe: { ...unsubscribe, frontendUrl: "https://app.example.com/" },
    });
    expect(m.text).toContain("https://app.example.com/unsubscribe?");
  });

  it("nationwide: no unsubscribe link in text or html", () => {
    const m = composeAlertEmail({
      eventType: "NATIONWIDE_EVENT",
      explanation: "System-wide <disruption>",
      occurredAt: "2025-03-04T05:06:07Z",
    });
    expect(m.text).not.toMatch(/unsubscribe/i);
    expect(m.html).not.toMatch(/unsubscribe/i);
    expect(m.text).toContain("System-wide <disruption>");
    expect(m.html).toContain("System-wide &lt;disruption&gt;");
    expect(m.text).toContain("Nationwide event");
  });
});
