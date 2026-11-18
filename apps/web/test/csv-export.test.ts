import { describe, expect, it } from "vitest";
import type { EventSummary } from "../src/api/client";
import { csvFileName } from "../src/lib/download-file";
import { eventsToCsv } from "../src/lib/events-to-csv";

const ev = (explanation: string, over: Partial<EventSummary> = {}): EventSummary => ({
  type: "GROUND_STOP_STARTED",
  airportId: "ATL",
  occurredAt: "2026-01-02T10:00:00.000Z",
  explanation,
  ...over,
});

describe("eventsToCsv", () => {
  it("gives only the header (CRLF-terminated, no BOM) for an empty list", () => {
    expect(eventsToCsv([])).toBe("time_utc,type,airport,explanation\r\n");
  });

  it("quotes every field and leaves plain text unchanged", () => {
    expect(eventsToCsv([ev("Storms at Atlanta.")])).toBe(
      'time_utc,type,airport,explanation\r\n"2026-01-02T10:00:00.000Z","GROUND_STOP_STARTED","ATL","Storms at Atlanta."\r\n',
    );
  });

  it("doubles inner quotes and keeps commas and newlines inside the quotes", () => {
    const csv = eventsToCsv([ev('He said "stop", then\nwaited')]);
    expect(csv).toContain('"He said ""stop"", then\nwaited"');
  });

  it("normalises the time to ISO UTC and writes a null airport as an empty field", () => {
    const csv = eventsToCsv([ev("x", { occurredAt: "2026-01-02T05:00:00-05:00", airportId: null })]);
    expect(csv).toContain('"2026-01-02T10:00:00.000Z","GROUND_STOP_STARTED","","x"');
  });

  it.each(["=", "+", "-", "@", "\t", "\r"])("prefixes an apostrophe when a field starts with %j", (c) => {
    expect(eventsToCsv([ev(`${c}SUM(A1)`)])).toContain(`"'${c}SUM(A1)"`);
  });

  it("does not prefix a field with the formula character in the middle", () => {
    expect(eventsToCsv([ev("a=b")])).toContain('"a=b"');
  });
});

describe("csvFileName", () => {
  it("uses the UTC date", () => {
    expect(csvFileName("ATL", new Date("2026-01-02T23:30:00.000Z"))).toBe("aerobrief-ATL-2026-01-02.csv");
    expect(csvFileName("ATL", new Date("2026-01-03T00:30:00.000Z"))).toBe("aerobrief-ATL-2026-01-03.csv");
  });
});
