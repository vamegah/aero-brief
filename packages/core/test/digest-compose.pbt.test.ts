// Feature: aerobrief-phase2, Property 9: Digest composition
// **Validates: Requirements 11.7, 11.8, 11.9, 11.12, 11.16**
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  composeDigest,
  cutUtf16,
  NO_DISRUPTIONS_LINE,
  STALE_NOTICE,
  SUBJECT_MAX,
  type DigestEvent,
  type DigestInput,
} from "../src/digest/content";

const NUM_RUNS = 200;
const now = new Date("2026-11-14T12:00:00.000Z");
const RAW_REASON = "WX:TSTM";

const FORBIDDEN = [NO_DISRUPTIONS_LINE, STALE_NOTICE, RAW_REASON];

const hostileChar = fc.oneof(
  fc.constantFrom(
    "<",
    ">",
    "&",
    '"',
    "'",
    "&amp;",
    "<script>",
    "😀",
    "𝒳",
    "\u0000",
    "\u001b",
    "\u0007",
    "\n",
    "\t",
  ),
  fc.string({ maxLength: 2 }),
);
const hostile = fc
  .array(hostileChar, { minLength: 1, maxLength: 8 })
  .map((parts) => parts.join(""))
  .filter((s) => FORBIDDEN.every((f) => !s.includes(f)));

const baseUrl = fc
  .tuple(
    fc.constantFrom("https://aerobrief.example", "https://a.example/app", "http://localhost:5173"),
    fc.constantFrom("", "/", "//"),
    fc.constantFrom("", "?a=1&b=<2>", "?q=\"x'y"),
  )
  .map(([host, slashes, query]) => (query ? `${host}${query}${slashes}` : `${host}${slashes}`));
const unsubscribeUrl = fc
  .tuple(fc.constantFrom("https://api.example/digest/unsubscribe"), fc.constantFrom("", "&x=<y>", "?u='1'&s=\"2\""))
  .map(([a, b]) => `${a}?token=abc${b.replace("?", "&")}`);

const instant = fc.integer({ min: 0, max: 86_400_000 }).map((age) => new Date(now.getTime() - age).toISOString());

const event: fc.Arbitrary<DigestEvent> = fc
  .record({
    type: fc.constantFrom("GROUND_STOP_STARTED", "GROUND_STOP_ENDED", "NATIONWIDE_EVENT"),
    airportId: fc.constantFrom("ATL", "JFK", "ORD"),
    airportName: hostile,
    occurredAt: instant,
    explanation: hostile,
  })
  .map((e) => {
    const nationwide = e.type === "NATIONWIDE_EVENT";
    return {
      ...e,
      type: e.type as DigestEvent["type"],
      airportId: nationwide ? null : e.airportId,
      airportName: nationwide ? null : e.airportName,
      // Raw FAA data the composer could be handed; it must never be shown.
      rawReason: RAW_REASON,
    } as DigestEvent;
  });

const airport = fc.record({
  airportId: fc.constantFrom("ATL", "JFK", "ORD", "DEN"),
  name: hostile,
  hasGroundStop: fc.constantFrom(true, false, null),
});

type Freshness = "fresh" | "stale" | "missing";
const snapshot = fc.oneof(
  fc.integer({ min: 0, max: 600_000 }).map((age) => ({ kind: "fresh" as Freshness, age })),
  fc.integer({ min: 600_001, max: 86_400_000 }).map((age) => ({ kind: "stale" as Freshness, age })),
  fc.constant({ kind: "missing" as Freshness, age: 0 }),
);

const input = fc
  .record({
    events: fc.array(event, { maxLength: 6 }),
    watchedAirports: fc.array(airport, { maxLength: 4 }),
    snap: snapshot,
    frontendUrl: baseUrl,
    unsubscribeUrl,
  })
  .map(({ snap, ...rest }) => ({
    freshness: snap.kind,
    value: {
      digestDate: "2026-11-14",
      now,
      latestSnapshotCapturedAt:
        snap.kind === "missing" ? null : new Date(now.getTime() - snap.age).toISOString(),
      ...rest,
    } as DigestInput,
  }));

/** Independent HTML escape, so the test does not trust the code under test. */
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const utc = (iso: string) => `${new Date(iso).toISOString().slice(0, 16).replace("T", " ")} UTC`;

const hasLoneSurrogate = (s: string) => {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const n = s.charCodeAt(i + 1);
      if (!(n >= 0xdc00 && n <= 0xdfff)) return true;
      i++;
    } else if (c >= 0xdc00 && c <= 0xdfff) return true;
  }
  return false;
};

/** Removes the composer's own tags; whatever is left must be free of markup characters. */
const stripOwnTags = (html: string) =>
  html.replace(/<\/?(?:h1|h2|p|strong|ul|li)>|<br>|<a href="[^"<>]*">|<\/a>/g, "");

describe("Property 9: Digest composition", () => {
  it("subject is at most 100 UTF-16 units with no lone surrogate", () => {
    fc.assert(
      fc.property(input, ({ value }) => {
        const { subject } = composeDigest(value);
        expect(subject.length).toBeLessThanOrEqual(SUBJECT_MAX);
        expect(hasLoneSurrogate(subject)).toBe(false);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("cutUtf16 never exceeds the limit or splits a surrogate pair", () => {
    fc.assert(
      fc.property(hostile, fc.integer({ min: 0, max: 20 }), (s, max) => {
        const cut = cutUtf16(s, max);
        expect(cut.length).toBeLessThanOrEqual(max);
        expect(hasLoneSurrogate(cut)).toBe(false);
        expect(s.startsWith(cut)).toBe(true);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("HTML has no unescaped markup characters from inputs and shows the escaped forms", () => {
    fc.assert(
      fc.property(input, ({ value }) => {
        const { html } = composeDigest(value);
        const rest = stripOwnTags(html);
        expect(rest).not.toMatch(/[<>"']/);
        expect(rest).not.toMatch(/&(?!(?:amp|lt|gt|quot|#39);)/);
        for (const e of value.events) {
          expect(html).toContain(esc(e.explanation));
          if (e.airportName) expect(html).toContain(esc(e.airportName));
        }
        for (const a of value.watchedAirports) expect(html).toContain(esc(a.name));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("text and HTML include every explanation, airport, event time and both links", () => {
    fc.assert(
      fc.property(input, ({ value }) => {
        const { text, html } = composeDigest(value);
        const watchlist = `${value.frontendUrl.replace(/\/+$/, "")}/watchlist`;
        for (const e of value.events) {
          expect(text).toContain(e.explanation);
          expect(html).toContain(esc(e.explanation));
          expect(text).toContain(utc(e.occurredAt));
          expect(html).toContain(utc(e.occurredAt));
          if (e.airportName) expect(text).toContain(e.airportName);
        }
        for (const a of value.watchedAirports) expect(text).toContain(a.name);
        expect(text).toContain(watchlist);
        expect(text).toContain(value.unsubscribeUrl);
        expect(html).toContain(`href="${esc(watchlist)}"`);
        expect(html).toContain(`href="${esc(value.unsubscribeUrl)}"`);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("zero events: the no-disruptions line appears; otherwise it does not", () => {
    fc.assert(
      fc.property(input, ({ value }) => {
        const { text, html } = composeDigest(value);
        if (value.events.length === 0) {
          expect(text).toContain(NO_DISRUPTIONS_LINE);
          expect(html).toContain(NO_DISRUPTIONS_LINE);
          for (const a of value.watchedAirports) {
            expect(text).toContain(`${a.name}: `);
          }
        } else {
          expect(text).not.toContain(NO_DISRUPTIONS_LINE);
          expect(html).not.toContain(NO_DISRUPTIONS_LINE);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("stale or missing snapshot shows the stale notice; fresh does not", () => {
    fc.assert(
      fc.property(input, ({ freshness, value }) => {
        const { text, html } = composeDigest(value);
        const expected = freshness !== "fresh";
        expect(text.includes(STALE_NOTICE)).toBe(expected);
        expect(html.includes(STALE_NOTICE)).toBe(expected);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("raw FAA reason strings never appear", () => {
    fc.assert(
      fc.property(input, ({ value }) => {
        const { subject, text, html } = composeDigest(value);
        for (const out of [subject, text, html]) expect(out).not.toContain(RAW_REASON);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
