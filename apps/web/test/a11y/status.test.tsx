import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StaleDataBanner } from "../../src/components/StaleDataBanner";
import { StatusView } from "../../src/components/StatusView";
import { StatusPage } from "../../src/pages/StatusPage";
import { runAxe } from "./axe";
import { CAPTURED_AT, json, NO_DATA, NORMAL, STALE, stubFetch, SYSTEM_WIDE, okStatus } from "./fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a11y: status view", () => {
  it("has no violations while loading", async () => {
    const { container } = render(<StatusView status={null} events={[]} loading />);
    expect(await runAxe(container)).toHaveNoViolations();
  });

  it("has no violations in the no_data state", async () => {
    const { container } = render(<StatusView status={NO_DATA} events={[]} loading={false} />);
    expect(await runAxe(container)).toHaveNoViolations();
  });

  it("has no violations in the normal state", async () => {
    const { container } = render(<StatusView status={NORMAL} events={[]} loading={false} />);
    expect(await runAxe(container)).toHaveNoViolations();
  });

  it("has no violations with the system-wide banner", async () => {
    const { container } = render(<StatusView status={SYSTEM_WIDE} events={[]} loading={false} />);
    expect(screen.getByTestId("system-wide-banner")).toBeTruthy();
    expect(await runAxe(container)).toHaveNoViolations();
  });

  it("has no violations with the stale banner", async () => {
    const { container } = render(<StatusView status={STALE} events={[]} loading={false} />);
    expect(screen.getByTestId("stale-data-banner")).toBeTruthy();
    expect(await runAxe(container)).toHaveNoViolations();
  });

  it("has no violations with both banners and events", async () => {
    const both = okStatus({ stale: true, nationwide: true });
    const events = [
      {
        type: "GROUND_STOP_STARTED",
        airportId: "JFK",
        occurredAt: CAPTURED_AT,
        explanation: "A ground stop started at JFK.",
      },
    ];
    const { container } = render(<StatusView status={both} events={events} loading={false} />);
    expect(await runAxe(container)).toHaveNoViolations();
  });
});

describe("a11y: status sections", () => {
  const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000).toISOString();
  const events = [
    { type: "GROUND_STOP_STARTED", airportId: "JFK", occurredAt: minutesAgo(10), explanation: "A ground stop started at JFK." },
    { type: "GROUND_STOP_ENDED", airportId: "ATL", occurredAt: minutesAgo(60), explanation: "The ground stop at ATL ended." },
    { type: "NATIONWIDE_EVENT", airportId: null, occurredAt: minutesAgo(120), explanation: "Ground stops are active at several airports." },
  ];

  afterEach(() => {
    window.history.pushState({}, "", "/");
  });

  it("has no violations in the Events section with events", async () => {
    window.history.replaceState(null, "", "/#events");
    const { container } = render(<StatusView status={NORMAL} events={events} loading={false} />);
    await screen.findByRole("heading", { name: "Events in the last 24 hours" });
    expect(await runAxe(container)).toHaveNoViolations();
  });

  it("has no violations in the Events section with no events", async () => {
    window.history.replaceState(null, "", "/#events");
    const { container } = render(<StatusView status={NORMAL} events={[]} loading={false} />);
    await screen.findByRole("heading", { name: "Events in the last 24 hours" });
    expect(screen.getAllByText("No events in the last 24 hours.").length).toBeGreaterThan(0);
    expect(await runAxe(container)).toHaveNoViolations();
  });

  it("has no violations in the Events section when a filter matches nothing", async () => {
    window.history.replaceState(null, "", "/#events");
    const { container } = render(<StatusView status={NORMAL} events={events} loading={false} />);
    await screen.findByRole("heading", { name: "Events in the last 24 hours" });
    fireEvent.change(screen.getByLabelText("Airport"), { target: { value: "ORD" } });
    await screen.findByText("No events match these filters.");
    expect(await runAxe(container)).toHaveNoViolations();
  });

  it("has no violations in the Airports section", async () => {
    window.history.replaceState(null, "", "/#airports");
    const { container } = render(<StatusView status={NORMAL} events={events} loading={false} />);
    await screen.findByRole("heading", { name: "Airports" });
    expect(await runAxe(container)).toHaveNoViolations();
  });

  it("has no violations in the Airports section when the search matches nothing", async () => {
    window.history.replaceState(null, "", "/#airports");
    const { container } = render(<StatusView status={NORMAL} events={events} loading={false} />);
    await screen.findByRole("heading", { name: "Airports" });
    fireEvent.change(screen.getByLabelText("Search airports"), { target: { value: "zzzz" } });
    await screen.findByText("No airports match your search.");
    expect(await runAxe(container)).toHaveNoViolations();
  });
});

describe("a11y: Stale_Data_Banner", () => {
  it("has no violations on its own", async () => {
    const { container } = render(<StaleDataBanner capturedAt={CAPTURED_AT} />);
    expect(await runAxe(container)).toHaveNoViolations();
  });
});

describe("a11y: status page error states", () => {
  it("has no violations when the first load fails", async () => {
    stubFetch({ "GET /api/status/national": () => json({ error: "boom" }, 500) });
    const { container } = render(<StatusPage />);
    await screen.findByText("Could not load the status. Retrying automatically.");
    expect(await runAxe(container)).toHaveNoViolations();
  });

  it("has no violations when data loads from the API with the stale banner", async () => {
    stubFetch({ "GET /api/status/national": () => json(STALE) });
    const { container } = render(<StatusPage />);
    await screen.findByTestId("stale-data-banner");
    expect(await runAxe(container)).toHaveNoViolations();
  });
});
