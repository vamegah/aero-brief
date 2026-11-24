import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EventSummary } from "../../src/api/client";
import { StatusView } from "../../src/components/StatusView";
import { okStatus } from "./fixtures";

function setHash(hash: string): void {
  window.history.replaceState(null, "", `/${hash}`);
}

function makeEvents(count: number): EventSummary[] {
  const types = ["GROUND_STOP_STARTED", "GROUND_STOP_ENDED", "NATIONWIDE_EVENT"];
  return Array.from({ length: count }, (_, i) => {
    const type = types[i % 3] as string;
    return {
      type,
      airportId: type === "NATIONWIDE_EVENT" ? null : i % 2 === 0 ? "ATL" : "LAX",
      occurredAt: new Date(Date.UTC(2026, 0, 2, 11, 59 - i)).toISOString(),
      explanation: `Explanation ${i}`,
    };
  });
}

function pane(id: string): HTMLElement {
  return document.getElementById(`status-pane-${id}`) as HTMLElement;
}

afterEach(() => {
  window.history.pushState({}, "", "/");
  vi.restoreAllMocks();
});

describe("Status dashboard", () => {
  it("renders the menu links in order with hashes and one aria-current", () => {
    const { container } = render(<StatusView status={okStatus()} events={[]} loading={false} />);
    const nav = screen.getByRole("navigation", { name: "Status sections" });
    const links = Array.from(nav.querySelectorAll("a"));
    expect(links.map((a) => a.textContent)).toEqual(["Overview", "Events", "Airports"]);
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["#overview", "#events", "#airports"]);
    expect(links.filter((a) => a.getAttribute("aria-current") === "true")).toHaveLength(1);
    expect(links[0]?.getAttribute("aria-current")).toBe("true");
    const panes = Array.from(container.querySelectorAll(".status-pane")).map((p) => p.id);
    expect(panes).toEqual(["status-pane-overview", "status-pane-events", "status-pane-airports"]);
  });

  it("keeps the live region first and outside the panes, with banners on every section", () => {
    for (const hash of ["", "#events", "#airports"]) {
      setHash(hash);
      const status = okStatus({ stale: true, nationwide: { active: true, count: 2, artccs: [], explanation: "Wide." } });
      const { container, unmount } = render(<StatusView status={status} events={[]} loading={false} />);
      const live = container.querySelector("[aria-live]") as HTMLElement;
      expect(live.parentElement?.firstElementChild).toBe(live);
      expect(live.closest(".status-pane")).toBeNull();
      expect(live.querySelector("[data-testid='stale-data-banner']")).not.toBeNull();
      expect(live.querySelector("[data-testid='system-wide-banner']")).not.toBeNull();
      const nav = container.querySelector("nav") as HTMLElement;
      expect(live.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
      unmount();
    }
  });

  it("opens the section named by the hash and falls back to Overview", () => {
    setHash("#events");
    const first = render(<StatusView status={okStatus()} events={[]} loading={false} />);
    expect(pane("events").hidden).toBe(false);
    expect(pane("overview").hidden).toBe(true);
    first.unmount();
    setHash("#nope");
    render(<StatusView status={okStatus()} events={[]} loading={false} />);
    expect(pane("overview").hidden).toBe(false);
    expect(pane("events").hidden).toBe(true);
    expect(pane("airports").hidden).toBe(true);
  });

  it("switches panes on hashchange without moving focus, and keeps every pane mounted", () => {
    render(<StatusView status={okStatus()} events={[]} loading={false} />);
    const link = screen.getByRole("link", { name: "Airports" });
    link.focus();
    act(() => {
      setHash("#airports");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(pane("airports").hidden).toBe(false);
    expect(pane("overview").hidden).toBe(true);
    expect(document.activeElement).toBe(link);
    expect(link.getAttribute("aria-current")).toBe("true");
    expect(document.querySelectorAll(".status-pane")).toHaveLength(3);
  });

  it.each([
    [0, 0],
    [3, 3],
    [5, 5],
    [8, 5],
  ])("Overview shows %i events as %i cards, newest first, and the View all events link", (given, shown) => {
    render(<StatusView status={okStatus()} events={makeEvents(given)} loading={false} />);
    const cards = pane("overview").querySelectorAll(".event-card");
    expect(cards).toHaveLength(shown);
    if (shown > 0) expect(cards[0]?.textContent).toContain("Explanation 0");
    const link = screen.getByRole("link", { name: "View all events" });
    expect(link.getAttribute("href")).toBe("#events");
    if (given === 0) expect(pane("overview").textContent).toContain("No events in the last 24 hours.");
  });

  it("Events pane shows Data as of, count line and the filtered list", () => {
    setHash("#events");
    render(<StatusView status={okStatus()} events={makeEvents(6)} loading={false} />);
    const events = pane("events");
    expect(events.textContent).toContain("Data as of");
    expect(events.querySelectorAll(".event-card")).toHaveLength(6);
    expect(events.textContent).toContain("Showing 6 of 6 events");
    fireEvent.change(screen.getByLabelText("Airport"), { target: { value: "ATL" } });
    expect(events.textContent).toContain("Showing 2 of 6 events");
    expect(events.querySelectorAll(".event-card")).toHaveLength(2);
    fireEvent.change(screen.getByLabelText("Event type"), { target: { value: "NATIONWIDE_EVENT" } });
    expect(events.textContent).toContain("Showing 0 of 6 events");
    expect(events.textContent).toContain("No events match these filters.");
  });

  it("Events pane shows the no-events state with a zero count", () => {
    setHash("#events");
    render(<StatusView status={okStatus()} events={[]} loading={false} />);
    expect(pane("events").textContent).toContain("Showing 0 of 0 events");
    expect(pane("events").textContent).toContain("No events in the last 24 hours.");
    expect(pane("events").textContent).not.toContain("No events match these filters.");
  });

  it("Airports pane shows Data as of and keeps search text across section switches", () => {
    setHash("#airports");
    render(<StatusView status={okStatus()} events={[]} loading={false} />);
    expect(pane("airports").textContent).toContain("Data as of");
    fireEvent.change(screen.getByLabelText("Search airports"), { target: { value: "ATL" } });
    act(() => {
      setHash("#events");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    act(() => {
      setHash("#airports");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect((screen.getByLabelText("Search airports") as HTMLInputElement).value).toBe("ATL");
    expect(pane("airports").querySelectorAll("tbody tr")).toHaveLength(1);
  });

  it("sends no request on a filter change", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    setHash("#events");
    render(<StatusView status={okStatus()} events={makeEvents(4)} loading={false} />);
    fireEvent.change(screen.getByLabelText("Airport"), { target: { value: "LAX" } });
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("has no primary button, no event type code, no svg, img or map", () => {
    const { container } = render(<StatusView status={okStatus()} events={makeEvents(6)} loading={false} />);
    expect(container.querySelector(".btn--primary")).toBeNull();
    expect(container.querySelector("svg, img, [class*='map' i]")).toBeNull();
    expect(container.textContent).not.toMatch(/GROUND_STOP|NATIONWIDE_EVENT/);
    expect(container.textContent?.toLowerCase()).not.toContain("map");
  });

  it("renders no menu or panes while loading or without data", () => {
    const { container } = render(<StatusView status={null} events={[]} loading />);
    expect(container.querySelector("nav")).toBeNull();
    expect(container.querySelector(".status-pane")).toBeNull();
    expect(container.querySelectorAll("[aria-live]")).toHaveLength(1);
  });
});
