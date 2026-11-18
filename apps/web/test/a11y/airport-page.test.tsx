import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AirportPage } from "../../src/pages/AirportPage";
import { runAxe } from "./axe";
import { CAPTURED_AT, json, stubFetch } from "./fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.pushState({}, "", "/");
});

function body(opts: { stale?: boolean; stop?: object | null } = {}) {
  return {
    state: "ok",
    capturedAt: CAPTURED_AT,
    stale: opts.stale ?? false,
    airport: { airportId: "ATL", name: "Atlanta Hartsfield-Jackson", groundStop: opts.stop ?? null },
    events: [],
  };
}

const recent = {
  type: "GROUND_STOP_STARTED",
  airportId: "ATL",
  occurredAt: new Date().toISOString(),
  explanation: "A ground stop started at Atlanta.",
};

describe("a11y: airport page", () => {
  it("has no violations while loading", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
    const { container } = render(<AirportPage airportId="ATL" />);
    expect(screen.getByText("Loading airport status…")).toBeTruthy();
    expect(await runAxe(container)).toHaveNoViolations();
  });

  it("has no violations in the normal state with events", async () => {
    stubFetch({
      "GET /api/status/airport/ATL": () => json(body()),
      "GET /api/history/ATL": () => json({ airportId: "ATL", events: [recent] }),
    });
    const { container } = render(<AirportPage airportId="ATL" />);
    await screen.findByText("A ground stop started at Atlanta.");
    expect(await runAxe(container)).toHaveNoViolations();
  });

  it("has no violations with an active ground stop", async () => {
    stubFetch({
      "GET /api/status/airport/ATL": () =>
        json(body({ stop: { reasonText: "Thunderstorms", expectedEnd: "2026-01-02T14:30:00.000Z", advisoryUrl: null } })),
      "GET /api/history/ATL": () => json({ airportId: "ATL", events: [] }),
    });
    const { container } = render(<AirportPage airportId="ATL" />);
    await screen.findByText(/Expected to end around/);
    expect(await runAxe(container)).toHaveNoViolations();
  });

  it("has no violations with the stale banner", async () => {
    stubFetch({
      "GET /api/status/airport/ATL": () => json(body({ stale: true })),
      "GET /api/history/ATL": () => json({ airportId: "ATL", events: [] }),
    });
    const { container } = render(<AirportPage airportId="ATL" />);
    await screen.findByTestId("stale-data-banner");
    expect(await runAxe(container)).toHaveNoViolations();
  });

  it("has no violations in the empty state", async () => {
    stubFetch({
      "GET /api/status/airport/ATL": () => json(body()),
      "GET /api/history/ATL": () => json({ airportId: "ATL", events: [] }),
    });
    const { container } = render(<AirportPage airportId="ATL" />);
    await screen.findByText("No events for this airport in the last 24 hours.");
    expect(await runAxe(container)).toHaveNoViolations();
  });

  it("has no violations in the error state", async () => {
    stubFetch({
      "GET /api/status/airport/ATL": () => json({ error: "boom" }, 500),
      "GET /api/history/ATL": () => json({ airportId: "ATL", events: [] }),
    });
    const { container } = render(<AirportPage airportId="ATL" />);
    await screen.findByText(/Could not load this airport/);
    expect(await runAxe(container)).toHaveNoViolations();
  });
});
