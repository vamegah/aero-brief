import { describe, expect, it } from "vitest";
import {
  composeDigest,
  cutUtf16,
  NO_DISRUPTIONS_LINE,
  selectDigestContent,
  STALE_NOTICE,
  type DigestEvent,
  type DigestInput,
} from "../src/digest/content";

const now = new Date("2026-11-14T12:00:00.000Z");

describe("selectDigestContent", () => {
  const ev = (airportId: string | null, occurredAt: string, type = "GROUND_STOP_STARTED") => ({
    type,
    airportId,
    occurredAt,
    explanation: ` keep  this <as is> ${airportId}`,
  });

  it("keeps watched and nationwide events within 24 h, oldest first, unaltered", () => {
    const events = [
      ev("KATL", "2026-11-14T10:00:00.000Z"),
      ev(null, "2026-11-13T13:00:00.000Z", "NATIONWIDE_EVENT"),
      ev("KJFK", "2026-11-14T09:00:00.000Z"),
      ev("KATL", "2026-11-13T11:59:59.999Z"),
      ev("KATL", "2026-11-14T12:00:00.001Z"),
      ev("KATL", "2026-11-13T12:00:00.000Z"),
    ];
    const out = selectDigestContent({ now, events, watchedAirportIds: ["KATL"] });
    expect(out.map((e) => e.occurredAt)).toEqual([
      "2026-11-13T12:00:00.000Z",
      "2026-11-13T13:00:00.000Z",
      "2026-11-14T10:00:00.000Z",
    ]);
    expect(out[2]).toBe(events[0]);
  });
});

describe("composeDigest", () => {
  const event: DigestEvent = {
    type: "GROUND_STOP_STARTED",
    airportId: "KATL",
    airportName: "Atlanta <Hartsfield> & Co",
    occurredAt: "2026-11-14T10:05:59.000Z",
    explanation: "A ground stop is in effect. It's \"bad\" <b>.",
  };
  const base: DigestInput = {
    digestDate: "2026-11-14",
    now,
    events: [event],
    watchedAirports: [
      { airportId: "KATL", name: "Atlanta <Hartsfield> & Co", hasGroundStop: true },
      { airportId: "KJFK", name: "New York JFK", hasGroundStop: false },
    ],
    latestSnapshotCapturedAt: "2026-11-14T11:58:00.000Z",
    frontendUrl: "https://app.example.com/",
    unsubscribeUrl: "https://app.example.com/digest/unsubscribe?u=a&s=b",
  };

  it("lists events with UTC minute time, links, and escapes HTML", () => {
    const d = composeDigest(base);
    expect(d.subject).toBe("AeroBrief daily digest: 1 disruption");
    expect(d.text).toContain("2026-11-14 10:05 UTC");
    expect(d.text).toContain(event.explanation);
    expect(d.text).toContain("Atlanta <Hartsfield> & Co: Ground stop in effect");
    expect(d.text).toContain("New York JFK: Operating normally");
    expect(d.text).toContain("https://app.example.com/watchlist");
    expect(d.text).toContain(base.unsubscribeUrl);
    expect(d.text).not.toContain(NO_DISRUPTIONS_LINE);
    expect(d.text).not.toContain(STALE_NOTICE);
    expect(d.html).toContain("Atlanta &lt;Hartsfield&gt; &amp; Co");
    expect(d.html).toContain("It&#39;s &quot;bad&quot; &lt;b&gt;.");
    expect(d.html).not.toContain("<b>");
    expect(d.html).toContain('href="https://app.example.com/watchlist"');
  });

  it("states no disruptions and still lists airport status", () => {
    const d = composeDigest({ ...base, events: [] });
    expect(d.subject).toBe("AeroBrief daily digest: no disruptions");
    expect(d.text).toContain(NO_DISRUPTIONS_LINE);
    expect(d.text).toContain("New York JFK: Operating normally");
    expect(d.html).toContain(NO_DISRUPTIONS_LINE);
  });

  it("adds the stale notice when the Snapshot is missing or older than 10 minutes", () => {
    const old = composeDigest({ ...base, latestSnapshotCapturedAt: "2026-11-14T11:49:59.000Z" });
    expect(old.text).toContain("2026-11-14 11:49 UTC");
    expect(old.text).toContain(STALE_NOTICE);
    expect(old.html).toContain(STALE_NOTICE);
    const missing = composeDigest({ ...base, latestSnapshotCapturedAt: null });
    expect(missing.text).toContain(STALE_NOTICE);
    const edge = composeDigest({ ...base, latestSnapshotCapturedAt: "2026-11-14T11:50:00.000Z" });
    expect(edge.text).not.toContain(STALE_NOTICE);
  });

  it("keeps the subject within 100 UTF-16 units", () => {
    const d = composeDigest({ ...base, events: Array.from({ length: 12 }, () => event) });
    expect(d.subject).toBe("AeroBrief daily digest: 12 disruptions");
  });

  it("cutUtf16 never splits a surrogate pair", () => {
    const s = "a".repeat(99) + "\u{1F600}b";
    const out = cutUtf16(s, 100);
    expect(out).toBe("a".repeat(99));
    expect(cutUtf16("abc", 100)).toBe("abc");
    expect(cutUtf16("a\u{1F600}", 3)).toBe("a\u{1F600}");
  });
});