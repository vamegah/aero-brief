import { describe, expect, it } from "vitest";
import { STATUS_SECTION_IDS, STATUS_SECTION_LABELS, resolveStatusSection } from "../src/lib/status-sections";

describe("resolveStatusSection", () => {
  it.each([
    ["", "overview"],
    ["#", "overview"],
    ["#nope", "overview"],
    ["#EVENTS", "overview"],
    ["events", "events"],
    ["#events", "events"],
    ["#airports", "airports"],
    ["#overview", "overview"],
  ])("resolves %j to %s", (hash, expected) => {
    expect(resolveStatusSection(hash)).toBe(expected);
  });

  it("has a label for every section id", () => {
    for (const id of STATUS_SECTION_IDS) {
      expect(STATUS_SECTION_LABELS[id].length).toBeGreaterThan(0);
    }
  });
});
