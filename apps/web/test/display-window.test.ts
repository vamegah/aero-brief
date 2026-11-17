import { describe, expect, it } from "vitest";
import { DISPLAY_WINDOW_MS, selectDisplayEvents } from "../src/lib/display-window";

const now = new Date("2026-01-02T12:00:00.000Z");
const ago = (ms: number): string => new Date(now.getTime() - ms).toISOString();
const ev = (occurredAt: string): { occurredAt: string } => ({ occurredAt });

describe("selectDisplayEvents", () => {
  it("drops events older than 24 h and keeps one exactly 24 h old", () => {
    const result = selectDisplayEvents(
      [ev(ago(DISPLAY_WINDOW_MS + 1)), ev(ago(DISPLAY_WINDOW_MS)), ev(ago(1000))],
      now,
    );
    expect(result.map((e) => e.occurredAt)).toEqual([ago(1000), ago(DISPLAY_WINDOW_MS)]);
  });

  it("orders newest first without mutating the input", () => {
    const input = [ev(ago(3000)), ev(ago(1000)), ev(ago(2000))];
    const copy = [...input];
    const result = selectDisplayEvents(input, now);
    expect(result.map((e) => e.occurredAt)).toEqual([ago(1000), ago(2000), ago(3000)]);
    expect(input).toEqual(copy);
  });

  it("drops events with an unparseable timestamp", () => {
    expect(selectDisplayEvents([ev("not a date")], now)).toEqual([]);
  });
});
