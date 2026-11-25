import { render } from "@testing-library/react";
import { explainStructured } from "@aerobrief/core/explain";
import type { Incident } from "@aerobrief/core/incidents";
import { describe, expect, it } from "vitest";
import { StructuredExplanation } from "../../src/components/StructuredExplanation";

const now = new Date("2026-11-20T12:00:00Z");
const incident: Incident = {
  key: "JFK-1",
  type: "GROUND_STOP_STARTED",
  airportId: "JFK",
  startedAt: "2026-11-20T11:00:00Z",
  endedAt: null,
  durationMs: null,
} as unknown as Incident;

describe("StructuredExplanation", () => {
  it("renders the five labels in order as a description list", () => {
    const { container } = render(<StructuredExplanation explanation={explainStructured(incident, "VOLUME", null, now)} />);
    expect(container.querySelector("dl")).not.toBeNull();
    const labels = [...container.querySelectorAll("dt")].map((n) => n.textContent);
    expect(labels).toEqual(["What's happening", "Why", "Likely impact", "Next update", "Source"]);
    for (const dd of container.querySelectorAll("dd")) expect(dd.textContent?.trim()).not.toBe("");
  });

  it("shows the fallback text when the reason and next update are absent", () => {
    const { container } = render(<StructuredExplanation explanation={explainStructured(incident, null, null, now)} />);
    const text = container.textContent ?? "";
    expect(text).toContain("Reason not published by the FAA");
    expect(text).toContain("Not yet announced");
  });

  it("shows no raw FAA reason code", () => {
    const { container } = render(<StructuredExplanation explanation={explainStructured(incident, "VOLUME", null, now)} />);
    expect(container.textContent).not.toContain("VOLUME");
  });
});
