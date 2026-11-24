import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../../src/App";
import { airportIdFromPath } from "../../src/pages/AirportPage";
import { apiError, CAPTURED_AT, json, stubFetch, type Routes } from "../a11y/fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  window.history.pushState({}, "", "/");
});

const NOW = Date.parse(CAPTURED_AT);
const iso = (hoursAgo: number) => new Date(NOW - hoursAgo * 3_600_000).toISOString();

function airportBody(opts: { stale?: boolean; stop?: object | null } = {}) {
  return {
    state: "ok",
    capturedAt: CAPTURED_AT,
    stale: opts.stale ?? false,
    airport: {
      airportId: "ATL",
      name: "Atlanta Hartsfield-Jackson",
      groundStop: opts.stop === undefined ? null : opts.stop,
    },
    events: [],
  };
}

function open(path: string, routes: Routes) {
  window.history.pushState({}, "", path);
  stubFetch(routes);
  return render(<App />);
}

const event = (hoursAgo: number, explanation: string) => ({
  incidentKey: `evt-${hoursAgo}`,
  type: "GROUND_STOP_STARTED",
  airportId: "ATL",
  occurredAt: iso(hoursAgo),
  explanation,
});

describe("airportIdFromPath", () => {
  it("accepts 3-4 letters, upper-cased, and rejects anything else", () => {
    expect(airportIdFromPath("/airport/atl")).toBe("ATL");
    expect(airportIdFromPath("/airport/KATL")).toBe("KATL");
    expect(airportIdFromPath("/airport/")).toBeNull();
    expect(airportIdFromPath("/airport/AT")).toBeNull();
    expect(airportIdFromPath("/airport/AT1")).toBeNull();
    expect(airportIdFromPath("/airport/ATLAS")).toBeNull();
  });
});

describe("AirportPage ground stop durations", () => {
  const stopEvents = () => [
    { incidentKey: "evt-1", type: "GROUND_STOP_ENDED", airportId: "ATL", occurredAt: iso(1), explanation: "The ground stop at Atlanta ended." },
    { incidentKey: "evt-1", type: "GROUND_STOP_STARTED", airportId: "ATL", occurredAt: iso(2 + 20 / 60), explanation: "A ground stop started at Atlanta." },
  ];

  it("shows the duration on the ended event and leaves the explanation unchanged", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: NOW });
    open("/airport/ATL", {
      "GET /api/status/airport/ATL": () => json(airportBody()),
      "GET /api/history/ATL": () => json({ airportId: "ATL", events: stopEvents() }),
    });
    await screen.findByText("Lasted 1 h 20 min");
    expect(screen.getAllByText(/^Lasted /)).toHaveLength(1);
    expect(screen.getByText("The ground stop at Atlanta ended.")).toBeTruthy();
  });

  it("shows no duration on the status page", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: NOW });
    open("/", {
      "GET /api/status/national": () =>
        json({
          state: "ok",
          capturedAt: CAPTURED_AT,
          stale: false,
          airports: [{ airportId: "ATL", name: "Atlanta Hartsfield-Jackson", groundStop: null }],
          nationwide: { active: false, count: 0, artccs: [], explanation: null },
          events: stopEvents(),
        }),
    });
    // The event shows in the Overview latest events and in the Events pane.
    const occurrences = await screen.findAllByText("The ground stop at Atlanta ended.");
    expect(occurrences).toHaveLength(2);
    for (const el of occurrences) {
      const pane = el.closest(".status-pane") as HTMLElement;
      expect(within(pane).queryByText(/^Lasted /)).toBeNull();
    }
    expect(screen.queryByText(/^Lasted /)).toBeNull();
  });
});

describe("AirportPage", () => {
  it("renders the page at /airport/ATL with name, status and last updated", async () => {
    open("/airport/ATL", {
      "GET /api/status/airport/ATL": () => json(airportBody()),
      "GET /api/history/ATL": () => json({ airportId: "ATL", events: [] }),
    });
    expect(screen.getByText("Loading airport status…")).toBeTruthy();
    await screen.findByRole("heading", { level: 2, name: "Atlanta Hartsfield-Jackson (ATL)" });
    expect(screen.getByText("No ground stop reported")).toBeTruthy();
    expect(screen.getByText(/Last updated/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to national status" }).getAttribute("href")).toBe("/");
    expect(screen.getByText("No events for this airport in the last 24 hours.")).toBeTruthy();
  });

  it("upper-cases the id from the path", async () => {
    open("/airport/atl", {
      "GET /api/status/airport/ATL": () => json(airportBody()),
      "GET /api/history/ATL": () => json({ airportId: "ATL", events: [] }),
    });
    await screen.findByText("Atlanta Hartsfield-Jackson (ATL)");
  });

  it.each(["/airport/XYZ", "/airport/", "/airport/A1"])("renders Not found for %s", async (path) => {
    open(path, {
      "GET /api/status/airport/XYZ": () => apiError(404, "airport_not_found", "Not monitored."),
      "GET /api/history/XYZ": () => apiError(404, "airport_not_found", "Not monitored."),
    });
    await screen.findByRole("heading", { level: 2, name: "Page not found" });
  });

  it("shows ground stop details, with the FAA status fallback and until further notice", async () => {
    open("/airport/ATL", {
      "GET /api/status/airport/ATL": () => json(airportBody({ stop: { reasonText: "Thunderstorms" } })),
      "GET /api/history/ATL": () => json({ airportId: "ATL", events: [] }),
    });
    await screen.findByText("Ground stop");
    expect(screen.getByText("Thunderstorms")).toBeTruthy();
    expect(screen.getByText("Until further notice")).toBeTruthy();
    expect(screen.getByRole("link", { name: /FAA status page/ }).getAttribute("href")).toBe("https://nasstatus.faa.gov");
  });

  it("shows expected end and the FAA advisory link when present", async () => {
    open("/airport/ATL", {
      "GET /api/status/airport/ATL": () =>
        json(
          airportBody({
            stop: {
              reasonText: "Thunderstorms",
              expectedEnd: "2026-01-02T14:30:00.000Z",
              advisoryUrl: "https://www.fly.faa.gov/adv/1",
            },
          }),
        ),
      "GET /api/history/ATL": () => json({ airportId: "ATL", events: [] }),
    });
    await screen.findByText(/Expected to end around/);
    expect(screen.getByRole("link", { name: /FAA advisory/ }).getAttribute("href")).toBe("https://www.fly.faa.gov/adv/1");
  });

  it("puts the stale banner inside an always-mounted aria-live region", async () => {
    const { container } = open("/airport/ATL", {
      "GET /api/status/airport/ATL": () => json(airportBody({ stale: true })),
      "GET /api/history/ATL": () => json({ airportId: "ATL", events: [] }),
    });
    const live = container.querySelector("main [aria-live='polite']");
    expect(live).not.toBeNull();
    expect(within(live as HTMLElement).queryByTestId("stale-data-banner")).toBeNull();
    const banner = await screen.findByTestId("stale-data-banner");
    expect(live?.contains(banner)).toBe(true);
  });

  it("lists events newest first and drops events older than 24 hours", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: NOW });
    open("/airport/ATL", {
      "GET /api/status/airport/ATL": () => json(airportBody()),
      "GET /api/history/ATL": () =>
        json({
          airportId: "ATL",
          events: [event(30, "Too old"), event(5, "Older one"), event(1, "Newest one")],
        }),
    });
    await screen.findByText("Newest one");
    expect(screen.queryByText("Too old")).toBeNull();
    const list = document.querySelector("ul.event-list") as HTMLElement;
    const items = within(list).getAllByRole("listitem").map((li) => li.textContent ?? "");
    expect(items).toHaveLength(2);
    expect(items[0]).toContain("Newest one");
    expect(items[1]).toContain("Older one");
  });

  it("shows an error with a retry hint when a request fails", async () => {
    open("/airport/ATL", {
      "GET /api/status/airport/ATL": () => json({ error: "boom" }, 500),
      "GET /api/history/ATL": () => json({ airportId: "ATL", events: [] }),
    });
    await screen.findByText("Could not load this airport. Reload the page to try again.");
    expect(screen.getByRole("alert").textContent).toContain("Reload the page");
  });
});
