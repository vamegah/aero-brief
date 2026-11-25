import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { EventSummary } from "../../src/api/client";
import { StatusView } from "../../src/components/StatusView";
import { AIRPORT_COUNT, okStatus } from "./fixtures";

// Requirements 11.1, 11.2, 11.4, 11.5, 11.6, 11.7.

function ev(over: Partial<EventSummary> & { incidentKey: string; type: string; occurredAt: string }): EventSummary {
  return { airportId: "ATL", explanation: "raw", ...over };
}

// Incident "a" (ATL) has ended; incident "b" (LAX) is still active.
const EVENTS: EventSummary[] = [
  ev({ incidentKey: "a", type: "GROUND_STOP_STARTED", occurredAt: "2026-01-02T10:00:00.000Z" }),
  ev({ incidentKey: "a", type: "GROUND_STOP_ENDED", occurredAt: "2026-01-02T11:00:00.000Z" }),
  ev({ incidentKey: "b", type: "GROUND_STOP_STARTED", airportId: "LAX", occurredAt: "2026-01-02T09:00:00.000Z" }),
];

function open(section: "airports" | "events", search = ""): void {
  window.history.replaceState(null, "", `/${search}#${section}`);
}

function pane(id: string): HTMLElement {
  return document.getElementById(`status-pane-${id}`) as HTMLElement;
}

beforeEach(() => open("airports"));
afterEach(() => window.history.replaceState(null, "", "/"));

describe("Airports pane filter and search", () => {
  it("shows live counts and a selected state that is more than color", () => {
    render(<StatusView status={okStatus()} events={[]} loading={false} />);
    const all = screen.getByRole("button", { name: `All (${AIRPORT_COUNT})` });
    const affected = screen.getByRole("button", { name: "Affected (1)" });
    expect(all.getAttribute("aria-pressed")).toBe("true");
    expect(all.querySelector("span.icon--check[aria-hidden='true']")).not.toBeNull();
    expect(affected.querySelector(".icon--check")).toBeNull();
    fireEvent.click(affected);
    expect(affected.getAttribute("aria-pressed")).toBe("true");
    expect(affected.querySelector("span.icon--check[aria-hidden='true']")).not.toBeNull();
    expect(all.querySelector(".icon--check")).toBeNull();
    // The counts do not change with the selection.
    expect(all.textContent).toBe(`All (${AIRPORT_COUNT})`);
  });

  it("has the placeholder, a decorative search icon, and a clear button only when there is text", () => {
    const { container } = render(<StatusView status={okStatus()} events={[]} loading={false} />);
    const input = screen.getByLabelText("Search airports") as HTMLInputElement;
    expect(input.placeholder).toBe("Code or city, e.g. LAS or Las Vegas");
    expect(container.querySelector(".search-field span.icon--search[aria-hidden='true']")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Clear search" })).toBeNull();
    fireEvent.change(input, { target: { value: "atl" } });
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(input.value).toBe("");
    expect(container.querySelectorAll("tbody tr")).toHaveLength(AIRPORT_COUNT);
    expect(screen.queryByRole("button", { name: "Clear search" })).toBeNull();
  });

  it("matches the city, ignoring case", () => {
    const { container } = render(<StatusView status={okStatus()} events={[]} loading={false} />);
    fireEvent.change(screen.getByLabelText("Search airports"), { target: { value: "las VEGAS" } });
    expect(Array.from(container.querySelectorAll("tbody tr th")).map((th) => th.textContent)).toEqual(["LAS"]);
  });

  it("announces the count in its own polite region, apart from the banner region", () => {
    const { container } = render(<StatusView status={okStatus({ stale: true })} events={[]} loading={false} />);
    const banner = container.querySelector(".status-view__live") as HTMLElement;
    const region = pane("airports").querySelector("[role='status']") as HTMLElement;
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(banner.contains(region)).toBe(false);
    expect(region.textContent).toBe(`Showing ${AIRPORT_COUNT} of ${AIRPORT_COUNT} airports`);
    fireEvent.change(screen.getByLabelText("Search airports"), { target: { value: "lax" } });
    expect(region.textContent).toBe(`Showing 1 of ${AIRPORT_COUNT} airports`);
    expect(banner.textContent).not.toContain("Showing");
  });

  it("shows Clear filters on an empty result and restores the full list", () => {
    const { container } = render(<StatusView status={okStatus()} events={[]} loading={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Affected (1)" }));
    fireEvent.change(screen.getByLabelText("Search airports"), { target: { value: "lax" } });
    expect(container.querySelectorAll("tbody tr")).toHaveLength(0);
    const clear = screen.getByRole("button", { name: "Clear filters" });
    expect(clear.className).not.toContain("btn--primary");
    fireEvent.click(clear);
    expect(container.querySelectorAll("tbody tr")).toHaveLength(AIRPORT_COUNT);
    expect(screen.getByRole("button", { name: `All (${AIRPORT_COUNT})` }).getAttribute("aria-pressed")).toBe("true");
    expect((screen.getByLabelText("Search airports") as HTMLInputElement).value).toBe("");
    expect(container.querySelector(".btn--primary")).toBeNull();
  });
});

describe("Events pane filters", () => {
  it("filters by state and updates the count", () => {
    open("events");
    render(<StatusView status={okStatus()} events={EVENTS} loading={false} />);
    const region = pane("events").querySelector("[role='status']") as HTMLElement;
    expect(region.textContent).toBe("Showing 2 of 2 incidents");
    fireEvent.change(screen.getByLabelText("State"), { target: { value: "active" } });
    expect(region.textContent).toBe("Showing 1 of 2 incidents");
    expect(pane("events").querySelectorAll(".event-card")[0]?.textContent).toContain("LAX");
    fireEvent.change(screen.getByLabelText("State"), { target: { value: "ended" } });
    expect(region.textContent).toBe("Showing 1 of 2 incidents");
    expect(pane("events").querySelectorAll(".event-card")[0]?.textContent).toContain("ATL");
  });

  it("shows Clear filters when nothing matches and clears all three filters", () => {
    open("events");
    render(<StatusView status={okStatus()} events={EVENTS} loading={false} />);
    fireEvent.change(screen.getByLabelText("Airport"), { target: { value: "LAX" } });
    fireEvent.change(screen.getByLabelText("State"), { target: { value: "ended" } });
    expect(pane("events").textContent).toContain("No events match these filters.");
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(pane("events").textContent).toContain("Showing 2 of 2 incidents");
    expect((screen.getByLabelText("Airport") as HTMLSelectElement).value).toBe("");
    expect((screen.getByLabelText("State") as HTMLSelectElement).value).toBe("");
  });
});

describe("Filter state in the URL", () => {
  it("writes the state with replaceState, keeps the hash and adds no history entry", () => {
    const length = window.history.length;
    render(<StatusView status={okStatus()} events={EVENTS} loading={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Affected (1)" }));
    fireEvent.change(screen.getByLabelText("Search airports"), { target: { value: "Las Vegas" } });
    fireEvent.change(screen.getByLabelText("Airport"), { target: { value: "LAX" } });
    fireEvent.change(screen.getByLabelText("Event type"), { target: { value: "GROUND_STOP_STARTED" } });
    fireEvent.change(screen.getByLabelText("State"), { target: { value: "active" } });
    const params = new URLSearchParams(window.location.search);
    expect(Object.fromEntries(params)).toEqual({
      show: "affected",
      q: "Las Vegas",
      airport: "LAX",
      type: "GROUND_STOP_STARTED",
      state: "active",
    });
    expect(window.location.hash).toBe("#airports");
    expect(window.history.length).toBe(length);
  });

  it("leaves the URL clean when no filter is set, and drops it again after Clear", () => {
    render(<StatusView status={okStatus()} events={[]} loading={false} />);
    expect(window.location.search).toBe("");
    fireEvent.change(screen.getByLabelText("Search airports"), { target: { value: "x" } });
    expect(window.location.search).toBe("?q=x");
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(window.location.search).toBe("");
  });

  it("restores the state from the URL on load, round trip through a second mount", () => {
    open("airports", "?show=affected&q=atl");
    const first = render(<StatusView status={okStatus()} events={[]} loading={false} />);
    expect(screen.getByRole("button", { name: "Affected (1)" }).getAttribute("aria-pressed")).toBe("true");
    expect((screen.getByLabelText("Search airports") as HTMLInputElement).value).toBe("atl");
    expect(first.container.querySelectorAll("tbody tr")).toHaveLength(1);
    first.unmount();
    const second = render(<StatusView status={okStatus()} events={[]} loading={false} />);
    expect((screen.getByLabelText("Search airports") as HTMLInputElement).value).toBe("atl");
    expect(second.container.querySelectorAll("tbody tr")).toHaveLength(1);
  });

  it("restores the Events pane filters, and ignores an unknown airport or type", () => {
    open("events", "?airport=LAX&state=active");
    render(<StatusView status={okStatus()} events={EVENTS} loading={false} />);
    expect((screen.getByLabelText("Airport") as HTMLSelectElement).value).toBe("LAX");
    expect(pane("events").textContent).toContain("Showing 1 of 2 incidents");
    document.body.innerHTML = "";
    open("events", "?airport=ZZZ&type=NOPE");
    render(<StatusView status={okStatus()} events={EVENTS} loading={false} />);
    expect(pane("events").textContent).toContain("Showing 2 of 2 incidents");
  });

  it("keeps other query params", () => {
    open("airports", "?utm=1");
    render(<StatusView status={okStatus()} events={[]} loading={false} />);
    fireEvent.change(screen.getByLabelText("Search airports"), { target: { value: "a" } });
    expect(window.location.search).toBe("?utm=1&q=a");
  });
});
