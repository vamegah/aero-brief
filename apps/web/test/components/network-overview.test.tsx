import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusView } from "../../src/components/StatusView";
import type { EventSummary } from "../../src/api/client";
import { NOW, makeAirports, okStatus, useUtcDisplayMode } from "./fixtures";

const calm = () => makeAirports().map((a) => ({ ...a, groundStop: null }));

function ev(type: string, airportId: string, occurredAt: string): EventSummary {
  return { incidentKey: `${airportId}-1`, type, airportId, occurredAt, explanation: "x" } as EventSummary;
}

function renderOverview(status: Parameters<typeof StatusView>[0]["status"], events: EventSummary[] = []) {
  window.history.replaceState(null, "", "/");
  const { container } = render(<StatusView status={status} events={events} loading={false} now={NOW} />);
  return container.querySelector(".summary-card") as HTMLElement;
}

useUtcDisplayMode();

describe("Overview pane", () => {
  it("shows the all-normal headline and no-events fallback", () => {
    const card = renderOverview(okStatus({ airports: calm() }));
    expect(card.textContent).toContain("All 30 airports operating normally");
    expect(card.textContent).toContain("No events in the last 24 hours");
    expect(card.textContent).toContain("Ground stops: 0");
    expect(card.textContent).toContain("Recovering: 0");
  });

  it("shows the most recent event time in the all-normal headline", () => {
    const card = renderOverview(okStatus({ airports: calm() }), [
      ev("GROUND_STOP_ENDED", "ATL", "2026-01-01T10:00:00.000Z"),
    ]);
    expect(card.textContent).toContain("Most recent event Jan 1, 2026, 10:00 UTC");
  });

  it("marks stale data outdated and never says operating normally", () => {
    const card = renderOverview(okStatus({ airports: calm(), stale: true }));
    expect(card.textContent).toContain("outdated");
    expect(card.textContent).not.toContain("operating normally");
  });

  it("names an airport with a ground stop and counts it", () => {
    const card = renderOverview(okStatus());
    expect(card.textContent).toContain("Airport ATL (ATL)");
    expect(card.textContent).toContain("Ground Stop");
    expect(card.textContent).toContain("Ground stops: 1");
  });

  it("shows the recovering detail line with time since end and the AeroBrief estimate", () => {
    const card = renderOverview(okStatus({ airports: calm() }), [
      ev("GROUND_STOP_ENDED", "LAX", "2026-01-02T10:00:00.000Z"),
      ev("GROUND_STOP_STARTED", "LAX", "2026-01-02T09:00:00.000Z"),
    ]);
    expect(card.textContent).toContain("Recovering: 1");
    expect(card.textContent).toContain("Ended 2 h ago.");
    expect(card.textContent).toContain("AeroBrief estimate: back to normal in about 30 min to 1 h 30 min");
    expect(card.textContent).toContain("not an FAA figure");
  });

  it("shows Data Unavailable when there is no status data", () => {
    const card = renderOverview({ state: "no_data", message: "Waiting for the first FAA reading." });
    expect(card.textContent).toContain("Data Unavailable for all 30 airports");
    expect(card.textContent).not.toContain("operating normally");
  });
});
