import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AirportTable } from "../../src/components/AirportTable";
import { runAxe } from "./axe";

describe("a11y: airport table with ground stop details", () => {
  it("has no violations with active stops, with and without an advisory", async () => {
    const { container } = render(
      <AirportTable
        airports={[
          {
            airportId: "JFK",
            name: "New York JFK",
            groundStop: { reasonText: "Thunderstorms", expectedEnd: "2026-01-02T14:30:00.000Z", advisoryUrl: "https://www.faa.gov/a" },
          },
          { airportId: "ATL", name: "Atlanta", groundStop: { reasonText: "Low visibility", expectedEnd: null, advisoryUrl: null } },
          { airportId: "ORD", name: "Chicago", groundStop: null },
        ]}
      />,
    );
    expect(await runAxe(container)).toHaveNoViolations();
  });
});
