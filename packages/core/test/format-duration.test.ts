import { describe, expect, it } from "vitest";
import { formatDurationText } from "../src/format-duration";

const MIN = 60_000;

describe("formatDurationText", () => {
  it.each([
    [0, "less than 1 min"],
    [59_999, "less than 1 min"],
    [-5 * MIN, "less than 1 min"],
    [Number.NaN, "less than 1 min"],
    [MIN, "1 min"],
    [45 * MIN, "45 min"],
    [60 * MIN, "1 h"],
    [80 * MIN, "1 h 20 min"],
    [120 * MIN, "2 h"],
    [660 * MIN, "11 h"],
    [2100 * MIN, "35 h"],
  ])("formats %s ms as %s", (ms, text) => {
    expect(formatDurationText(ms)).toBe(text);
  });
});
