import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EventSummary } from "../../src/api/client";
import { WatchlistTable } from "../../src/components/WatchlistTable";
import { airportStatusById } from "../../src/lib/airport-status-by-id";
import { NOW, makeAirports } from "./fixtures";

// ui-review-fixes Task 23.2. Requirements 23.1, 23.3, 23.4.

afterEach(() => cleanup());

const minutesBefore = (min: number) => new Date(NOW.getTime() - min * 60_000).toISOString();

/** Real derivation: ATL has a ground stop, LAX ended one 30 min ago (Recovering), the rest are normal. */
function statuses() {
  const airports = makeAirports().map((a) => ({ ...a, groundStop: a.airportId === "ATL" ? { reasonText: "wind" } : null }));
  const events = [
    { incidentKey: "LAX-1", type: "GROUND_STOP_ENDED", airportId: "LAX", occurredAt: minutesBefore(30), explanation: "x" },
    { incidentKey: "LAX-1", type: "GROUND_STOP_STARTED", airportId: "LAX", occurredAt: minutesBefore(70), explanation: "x" },
  ] as EventSummary[];
  return { airports, statusById: airportStatusById({ airports, events, hasData: true, now: NOW }) };
}

function renderTable(watchlist: string[], withStatus = true) {
  const { airports, statusById } = statuses();
  return render(
    <WatchlistTable
      airports={airports.filter((a) => ["ATL", "LAX", "JFK"].includes(a.airportId))}
      watchlist={watchlist}
      statusById={withStatus ? statusById : undefined}
      disabled={false}
      onAdd={vi.fn()}
      onRemove={vi.fn()}
    />,
  );
}

function statusCell(container: HTMLElement, code: string): string {
  const row = [...container.querySelectorAll("tbody tr")].find((r) => r.querySelector("th")?.textContent?.includes(`(${code})`));
  return row?.querySelectorAll("td")[0]?.textContent ?? "";
}

describe("WatchlistTable status pill", () => {
  it.each([
    ["ATL", "Ground stop"],
    ["LAX", "Recovering"],
    ["JFK", "Operating normally"],
  ])("shows %s as %s next to Watching and Not watching", (code, pill) => {
    const watched = renderTable([code]);
    const watchedText = statusCell(watched.container, code);
    expect(watchedText).toContain("Watching");
    expect(watchedText).not.toContain("Not watching");
    expect(watchedText).toContain(pill);
    cleanup();

    const unwatched = renderTable([]);
    const unwatchedText = statusCell(unwatched.container, code);
    expect(unwatchedText).toContain("Not watching");
    expect(unwatchedText).toContain(pill);
  });

  it("keeps three cells per row and only the Watching pill without a status response", () => {
    const withStatus = renderTable(["ATL"]);
    const counts = [...withStatus.container.querySelectorAll("tbody tr")].map((r) => r.children.length);
    expect(counts).toEqual([3, 3, 3]);
    cleanup();

    const without = renderTable(["ATL"], false);
    expect(statusCell(without.container, "ATL")).toBe("Watching");
    expect(without.container.querySelectorAll("tbody tr td:nth-child(2)").length).toBe(3);
  });
});
