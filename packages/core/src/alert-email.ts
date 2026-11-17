/**
 * Alert email composition. Pure: no env reads, no I/O. The caller passes the
 * frontend URL and the already computed unsubscribe signature.
 */

export type AlertEventType = "GROUND_STOP_STARTED" | "GROUND_STOP_ENDED" | "NATIONWIDE_EVENT";

export type UnsubscribeInput = {
  frontendUrl: string;
  userId: string;
  airportId: string;
  sig: string;
};

export type AlertEmailInput =
  | {
      eventType: "GROUND_STOP_STARTED" | "GROUND_STOP_ENDED";
      airportName: string;
      explanation: string;
      /** ISO 8601 timestamp. */
      occurredAt: string;
      unsubscribe: UnsubscribeInput;
    }
  | {
      eventType: "NATIONWIDE_EVENT";
      /** Optional; nationwide emails are not airport specific. */
      airportName?: string;
      explanation: string;
      occurredAt: string;
    };

export type AlertEmail = { subject: string; text: string; html: string };

const EVENT_LABELS: Record<AlertEventType, string> = {
  GROUND_STOP_STARTED: "Ground stop started",
  GROUND_STOP_ENDED: "Ground stop ended",
  NATIONWIDE_EVENT: "Nationwide event",
};

/** Formats an ISO timestamp as `YYYY-MM-DD HH:mm UTC`. */
export function formatUtc(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildUnsubscribeUrl(u: UnsubscribeInput): string {
  const base = u.frontendUrl.replace(/\/+$/, "");
  return (
    `${base}/unsubscribe?u=${encodeURIComponent(u.userId)}` +
    `&a=${encodeURIComponent(u.airportId)}&sig=${encodeURIComponent(u.sig)}`
  );
}

export function composeAlertEmail(input: AlertEmailInput): AlertEmail {
  const label = EVENT_LABELS[input.eventType];
  const time = formatUtc(input.occurredAt);
  const airport = input.airportName;
  const unsubUrl = "unsubscribe" in input ? buildUnsubscribeUrl(input.unsubscribe) : null;

  const subject = airport ? `${label}: ${airport}` : label;

  const textLines: string[] = [];
  if (airport) textLines.push(`Airport: ${airport}`);
  textLines.push(`Event: ${label}`, `Time: ${time}`, "", input.explanation);
  if (unsubUrl) textLines.push("", `Unsubscribe from this airport: ${unsubUrl}`);

  const htmlParts: string[] = [];
  if (airport) htmlParts.push(`<p><strong>Airport:</strong> ${escapeHtml(airport)}</p>`);
  htmlParts.push(
    `<p><strong>Event:</strong> ${escapeHtml(label)}</p>`,
    `<p><strong>Time:</strong> ${escapeHtml(time)}</p>`,
    `<p>${escapeHtml(input.explanation)}</p>`,
  );
  if (unsubUrl) htmlParts.push(`<p><a href="${escapeHtml(unsubUrl)}">Unsubscribe from this airport</a></p>`);

  return { subject, text: textLines.join("\n"), html: htmlParts.join("\n") };
}
