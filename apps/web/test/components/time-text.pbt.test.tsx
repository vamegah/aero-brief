// @vitest-environment jsdom
import { render } from "@testing-library/react";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { TimeText } from "../../src/components/TimeText";

describe("TimeText properties", () => {
  // Feature: ui-improvements, Property 13: Time element datetime is preserved
  // **Validates: Requirements 7.6**
  it("Property 13: dateTime equals the input ISO string unchanged", () => {
    const iso = fc
      .integer({ min: Date.UTC(2000, 0, 1), max: Date.UTC(2100, 0, 1) })
      .map((ms) => new Date(ms).toISOString());
    fc.assert(
      fc.property(iso, fc.constantFrom("JFK", "LAX", "HNL", undefined), (value, airportId) => {
        const { container, unmount } = render(<TimeText iso={value} airportId={airportId} />);
        const time = container.querySelector("time");
        const ok = time?.getAttribute("datetime") === value;
        unmount();
        expect(ok).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});
