import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusView } from "../../src/components/StatusView";
import type { EventSummary } from "../../src/api/client";
import { airportStatusById } from "../../src/lib/airport-status-by-id";
import { buildNetworkOverview } from "../../src/lib/network-overview";
import { NOW, makeAirports, okStatus, useUtcDisplayMode } from "./fixtures";

useUtcDisplayMode();

const calm = () => makeAirports().map((a) => ({ ...a, groundStop: null }));
const minutesBefore = (min: number) => new Date(NOW.getTime() - min * 60_000).toISOString();

/** A 40-minute stop at LAX that ended `endedAgoMin` minutes before NOW. */
function stop(endedAgoMin: number): EventSummary[] {
  return [
    { incidentKey: "LAX-1", type: "GROUND_STOP_ENDED", airportId: "LAX", occurredAt: minutesBefore(endedAgoMin), explanation: "x" },
    { incidentKey: "LAX-1", type: "GROUND_STOP_STARTED", airportId: "LAX", occurredAt: minutesBefore(endedAgoMin + 40), explanation: "x" },
  ] as EventSummary[];
}

function airportsPill(container: HTMLElement): string {
  window.history.replaceState(null, "", "/#airports");
  const row = [...container.querySelectorAll("tbody tr")].find((r) => r.textContent?.includes("LAX"));
  return row?.querySelector("td:last-child")?.textContent ?? "";
}

describe("Recovering window agrees on every surface", () => {
  it.each([
    [30, "recovering", "Recovering: 1", "Recovering"],
    [90, "normal", "Recovering: 0", "Operating normally"],
  ])("a 40-minute stop that ended %i minutes ago", (agoMin, kind, chip, pill) => {
    const events = stop(agoMin);
    const airports = calm();

    expect(airportStatusById({ airports, events, hasData: true, now: NOW }).get("LAX")?.kind).toBe(kind);
    const overview = buildNetworkOverview({ airports, events, stale: false, hasData: true, now: NOW });
    expect(overview.summary.counts.recovering).toBe(kind === "recovering" ? 1 : 0);

    window.history.replaceState(null, "", "/");
    const { container } = render(<StatusView status={okStatus({ airports })} events={events} loading={false} now={NOW} />);
    expect((container.querySelector(".summary-card") as HTMLElement).textContent).toContain(chip);
    expect(airportsPill(container)).toContain(pill);
  });
});
