import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AirportSummary } from "../../src/api/client";
import { AirportTable } from "../../src/components/AirportTable";
import { formatUtc } from "../../src/lib/format-time";

const END = "2026-01-02T14:30:00.000Z";

function table(airports: AirportSummary[]) {
  return render(<AirportTable airports={airports} />);
}

describe("AirportTable ground stop details", () => {
  it("links each airport code to its page and keeps the header text as the code", () => {
    const { container } = table([{ airportId: "JFK", name: "New York JFK", groundStop: null }]);
    const link = screen.getByRole("link", { name: "JFK" });
    expect(link.getAttribute("href")).toBe("/airport/JFK");
    expect(container.querySelector("tbody th")?.textContent).toBe("JFK");
  });

  it("shows reason, expected end and the advisory link for an active stop", () => {
    const url = "https://www.fly.faa.gov/advisory/1";
    const { container } = table([
      { airportId: "JFK", name: "New York JFK", groundStop: { reasonText: "Thunderstorms", expectedEnd: END, advisoryUrl: url } },
    ]);
    const detail = container.querySelector(".airport-table__detail");
    expect(detail?.textContent).toContain("Thunderstorms");
    expect(detail?.textContent).toContain(`Expected to end around ${formatUtc(END)}`);
    const link = screen.getByRole("link", { name: /FAA advisory/ });
    expect(link.getAttribute("href")).toBe(url);
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(container.textContent?.toLowerCase()).not.toContain("map");
  });

  it("shows 'Until further notice' when expectedEnd is null", () => {
    const { container } = table([
      { airportId: "JFK", name: "a", groundStop: { reasonText: "x", expectedEnd: null, advisoryUrl: null } },
    ]);
    expect(container.querySelector(".airport-table__detail")?.textContent).toContain("Until further notice");
  });

  it("shows only the pill for a bare { reasonText } stop with no detail keys", () => {
    const { container } = table([{ airportId: "ATL", name: "b", groundStop: { reasonText: "y" } }]);
    expect(container.querySelector(".airport-table__detail")).toBeNull();
  });

  it("falls back to the FAA status page when there is no advisory URL", () => {
    table([{ airportId: "JFK", name: "a", groundStop: { reasonText: "x", expectedEnd: null, advisoryUrl: null } }]);
    const link = screen.getByRole("link", { name: /FAA status page/ });
    expect(link.getAttribute("href")).toBe("https://nasstatus.faa.gov");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("adds no detail to normal rows", () => {
    const { container } = table([{ airportId: "ATL", name: "Atlanta", groundStop: null }]);
    expect(container.querySelector(".airport-table__detail")).toBeNull();
    expect(container.querySelectorAll("tbody td")[1]?.textContent).toBe("No ground stop reported");
  });
});
