/**
 * Daily digest content. Pure: no I/O, no env reads, `now` and every link are
 * passed in. Requirements 11.7, 11.8, 11.9, 11.12, 11.16.
 */
import { escapeHtml, formatUtc } from "../alert-email";
import { isStale, RETENTION_MS } from "../time";

export type DigestEventType = "GROUND_STOP_STARTED" | "GROUND_STOP_ENDED" | "NATIONWIDE_EVENT";

/** Minimum shape `selectDigestContent` needs. Extra fields pass through untouched. */
export type DigestEventLike = {
  type: string;
  /** Null for NATIONWIDE_EVENT. */
  airportId: string | null;
  /** ISO 8601 instant. */
  occurredAt: string;
};

/** An event as listed in the digest. `explanation` is shown exactly as stored. */
export type DigestEvent = DigestEventLike & {
  type: DigestEventType;
  /** Null for NATIONWIDE_EVENT. */
  airportName: string | null;
  explanation: string;
};

export type DigestAirport = {
  airportId: string;
  name: string;
  /** True: active ground stop. False: none. Null: unknown (no Snapshot). */
  hasGroundStop: boolean | null;
};

export type DigestInput = {
  /** UTC date `YYYY-MM-DD` of the digest. */
  digestDate: string;
  now: Date;
  /** Already selected with `selectDigestContent`, in time order. */
  events: readonly DigestEvent[];
  watchedAirports: readonly DigestAirport[];
  /** `capturedAt` of the latest Snapshot, or null when there is none. */
  latestSnapshotCapturedAt: string | null;
  frontendUrl: string;
  /** Full digest unsubscribe link. */
  unsubscribeUrl: string;
};

export type DigestEmail = { subject: string; text: string; html: string };

export const SUBJECT_MAX = 100;
export const NO_DISRUPTIONS_LINE = "No disruptions at your airports in the last 24 hours";
export const STALE_NOTICE = "The data may be out of date.";

const WINDOW_MS = RETENTION_MS;

/**
 * Events from the 24 hours up to and including `now` (age 0..24 h) whose airport is
 * watched, plus every NATIONWIDE_EVENT. Ordered by `occurredAt` ascending (oldest first,
 * the order a reader follows a day); ties keep input order. Events are returned as given,
 * so the Explanation is unaltered. Events with an unparseable time are dropped.
 */
export function selectDigestContent<T extends DigestEventLike>(args: {
  now: Date;
  events: readonly T[];
  watchedAirportIds: ReadonlySet<string> | readonly string[];
}): T[] {
  const watched = new Set<string>(args.watchedAirportIds);
  const nowMs = args.now.getTime();
  return args.events
    .map((event, index) => ({ event, index, t: new Date(event.occurredAt).getTime() }))
    .filter(({ event, t }) => {
      const age = nowMs - t;
      if (Number.isNaN(age) || age < 0 || age > WINDOW_MS) return false;
      return (
        event.type === "NATIONWIDE_EVENT" ||
        (event.airportId !== null && watched.has(event.airportId))
      );
    })
    .sort((a, b) => a.t - b.t || a.index - b.index)
    .map(({ event }) => event);
}

/** Cuts to at most `max` UTF-16 code units without splitting a surrogate pair. */
export function cutUtf16(s: string, max: number): string {
  if (s.length <= max) return s;
  let out = "";
  for (const ch of s) {
    if (out.length + ch.length > max) break;
    out += ch;
  }
  return out;
}

const EVENT_LABELS: Record<DigestEventType, string> = {
  GROUND_STOP_STARTED: "Ground stop started",
  GROUND_STOP_ENDED: "Ground stop ended",
  NATIONWIDE_EVENT: "Nationwide event",
};

function statusText(a: DigestAirport): string {
  if (a.hasGroundStop === null) return "Current status unknown";
  return a.hasGroundStop ? "Ground stop in effect" : "Operating normally";
}

function buildSubject(count: number): string {
  const subject =
    count === 0
      ? "AeroBrief daily digest: no disruptions"
      : `AeroBrief daily digest: ${count} ${count === 1 ? "disruption" : "disruptions"}`;
  return cutUtf16(subject, SUBJECT_MAX);
}

export function composeDigest(input: DigestInput): DigestEmail {
  const base = input.frontendUrl.replace(/\/+$/, "");
  const watchlistUrl = `${base}/watchlist`;
  const unsubscribeUrl = input.unsubscribeUrl;

  const stale =
    input.latestSnapshotCapturedAt === null || isStale(input.latestSnapshotCapturedAt, input.now);
  const staleNotice =
    input.latestSnapshotCapturedAt === null
      ? `No recent FAA data is available. ${STALE_NOTICE}`
      : `The latest FAA data was captured at ${formatUtc(input.latestSnapshotCapturedAt)}. ${STALE_NOTICE}`;

  const heading = `AeroBrief daily digest for ${input.digestDate}`;
  const events = input.events.map((e) => ({
    airport: e.airportName,
    label: EVENT_LABELS[e.type],
    time: formatUtc(e.occurredAt),
    explanation: e.explanation,
  }));

  const text: string[] = [heading, ""];
  if (stale) text.push(staleNotice, "");
  if (events.length === 0) text.push(NO_DISRUPTIONS_LINE, "");
  else {
    text.push("Events in the last 24 hours:", "");
    for (const e of events) {
      text.push(e.airport ? `${e.airport}: ${e.label}` : e.label, `Time: ${e.time}`, e.explanation, "");
    }
  }
  text.push("Current status of your airports:");
  for (const a of input.watchedAirports) text.push(`${a.name}: ${statusText(a)}`);
  text.push("", `Your watchlist: ${watchlistUrl}`, `Unsubscribe from the daily digest: ${unsubscribeUrl}`);

  const html: string[] = [`<h1>${escapeHtml(heading)}</h1>`];
  if (stale) html.push(`<p><strong>${escapeHtml(staleNotice)}</strong></p>`);
  if (events.length === 0) html.push(`<p>${escapeHtml(NO_DISRUPTIONS_LINE)}</p>`);
  else {
    html.push("<h2>Events in the last 24 hours</h2>");
    for (const e of events) {
      const title = e.airport ? `${e.airport}: ${e.label}` : e.label;
      html.push(
        `<p><strong>${escapeHtml(title)}</strong><br>${escapeHtml(`Time: ${e.time}`)}<br>${escapeHtml(e.explanation)}</p>`,
      );
    }
  }
  html.push("<h2>Current status of your airports</h2>", "<ul>");
  for (const a of input.watchedAirports) {
    html.push(`<li>${escapeHtml(a.name)}: ${escapeHtml(statusText(a))}</li>`);
  }
  html.push(
    "</ul>",
    `<p><a href="${escapeHtml(watchlistUrl)}">Your watchlist</a></p>`,
    `<p><a href="${escapeHtml(unsubscribeUrl)}">Unsubscribe from the daily digest</a></p>`,
  );

  return {
    subject: buildSubject(events.length),
    text: text.join("\n"),
    html: html.join("\n"),
  };
}
