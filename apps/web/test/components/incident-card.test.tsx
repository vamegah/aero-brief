import { fireEvent, render, screen } from "@testing-library/react";
import type { Incident } from "@aerobrief/core/incidents";
import { describe, expect, it } from "vitest";
import { FAA_NAS_STATUS_URL, IncidentCard, formatElapsed } from "../../src/components/IncidentCard";

const NOW = new Date("2026-01-02T12:00:00.000Z");

const active: Incident = {
  incidentKey: "a",
  type: "GROUND_STOP_STARTED",
  airportId: "ATL",
  startedAt: "2026-01-02T10:40:00.000Z",
  endedAt: null,
  durationMs: null,
};
const resolved: Incident = {
  ...active,
  incidentKey: "r",
  startedAt: "2026-01-02T09:00:00.000Z",
  endedAt: "2026-01-02T10:20:00.000Z",
  durationMs: 80 * 60_000,
};

describe("IncidentCard", () => {
  it("shows an active incident with icon, text label and elapsed time, and the alarm modifier", () => {
    const { container } = render(<IncidentCard incident={active} now={NOW} />);
    const card = container.querySelector(".incident-card") as HTMLElement;
    expect(card.classList.contains("event-card--active")).toBe(true);
    expect(card.classList.contains("event-card--resolved")).toBe(false);
    expect(card.textContent).toContain("Active");
    expect(card.textContent).toContain("Ground stop");
    expect(card.textContent).toContain("Active for 1 h 20 min");
    expect(card.querySelector("span.icon--stop-octagon[aria-hidden='true']")).not.toBeNull();
  });

  it("shows an ended incident with a check icon, neutral style and total duration", () => {
    const { container } = render(<IncidentCard incident={resolved} now={NOW} />);
    const card = container.querySelector(".incident-card") as HTMLElement;
    expect(card.classList.contains("event-card--resolved")).toBe(true);
    expect(card.classList.contains("event-card--active")).toBe(false);
    expect(card.textContent).toContain("Ended");
    expect(card.textContent).toContain("Lasted 1 h 20 min");
    expect(card.querySelector("span.icon--check[aria-hidden='true']")).not.toBeNull();
    expect(card.querySelector("span.icon--stop-octagon")).toBeNull();
  });

  it("uses no svg or img and no primary button", () => {
    const { container } = render(<IncidentCard incident={active} now={NOW} />);
    fireEvent.click(screen.getByRole("button"));
    expect(container.querySelector("svg, img, .btn--primary")).toBeNull();
  });

  it("links the airport code to its page", () => {
    render(<IncidentCard incident={active} now={NOW} />);
    expect(screen.getByRole("link", { name: "ATL" }).getAttribute("href")).toBe("/airport/ATL");
  });

  it("expands and collapses with a native button and aria-expanded", () => {
    render(<IncidentCard incident={resolved} now={NOW} />);
    const button = screen.getByRole("button", { name: "Show details" });
    expect(button.tagName).toBe("BUTTON");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("list", { name: "Timeline" })).toBeNull();
    expect(screen.queryByRole("link", { name: /FAA NAS Status/ })).toBeNull();

    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(button.textContent).toBe("Hide details");
    expect(button.getAttribute("aria-controls")).not.toBeNull();
    const items = screen.getByRole("list", { name: "Timeline" }).querySelectorAll("li");
    expect(items[0]?.textContent).toContain("Started");
    expect(items[1]?.textContent).toContain("Ended");

    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("list", { name: "Timeline" })).toBeNull();
  });

  it("links to the FAA NAS Status site when expanded and shows no raw FAA reason text", () => {
    const { container } = render(<IncidentCard incident={active} reason="VOLUME" now={NOW} />);
    fireEvent.click(screen.getByRole("button"));
    const link = screen.getByRole("link", { name: /FAA NAS Status/ });
    expect(link.getAttribute("href")).toBe("https://nasstatus.faa.gov/");
    expect(FAA_NAS_STATUS_URL).toBe("https://nasstatus.faa.gov/");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(container.textContent).not.toContain("VOLUME");
    expect(container.textContent).toContain("more flights than the airport can handle at once");
  });

  it("renders the five explanation fields with fallbacks when expanded", () => {
    const { container } = render(<IncidentCard incident={active} now={NOW} />);
    fireEvent.click(screen.getByRole("button"));
    const labels = [...container.querySelectorAll("dt")].map((n) => n.textContent);
    expect(labels).toEqual(["What's happening", "Why", "Likely impact", "Next update", "Source"]);
    expect(container.textContent).toContain("Reason not published by the FAA");
    expect(container.textContent).toContain("Not yet announced");
  });

  it("shows the recovery status only when given", () => {
    const first = render(<IncidentCard incident={resolved} now={NOW} />);
    fireEvent.click(screen.getByRole("button"));
    expect(first.container.querySelector(".incident-card__recovery")).toBeNull();
    first.unmount();

    const { container } = render(
      <IncidentCard
        incident={resolved}
        now={NOW}
        recovery={{ sinceText: "Ended 1 h 40 min ago", estimateText: "AeroBrief estimate: about 40 min to 2 h" }}
      />,
    );
    fireEvent.click(screen.getByRole("button"));
    const recovery = container.querySelector(".incident-card__recovery") as HTMLElement;
    expect(recovery.textContent).toContain("Recovering");
    expect(recovery.textContent).toContain("Ended 1 h 40 min ago");
    expect(recovery.textContent).toContain("AeroBrief estimate");
  });

  it("says the start is unavailable for an incident built from an end event alone", () => {
    const orphan: Incident = { ...resolved, startedAt: resolved.endedAt as string, durationMs: 0 };
    const { container } = render(<IncidentCard incident={orphan} now={NOW} />);
    expect(container.textContent).not.toContain("Lasted");
    fireEvent.click(screen.getByRole("button"));
    expect(container.textContent).toContain("Not available (before the last 24 hours)");
  });

  it("renders a system-wide incident without an airport link", () => {
    const nationwide: Incident = { ...active, incidentKey: "N", type: "NATIONWIDE_EVENT", airportId: null };
    render(<IncidentCard incident={nationwide} now={NOW} />);
    expect(screen.getByText("System-wide disruption")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });
});

describe("formatElapsed", () => {
  it.each([
    [0, "less than 1 min"],
    [45 * 60_000, "45 min"],
    [60 * 60_000, "1 h"],
    [80 * 60_000, "1 h 20 min"],
  ])("formats %i ms", (ms, text) => {
    expect(formatElapsed(ms)).toBe(text);
  });
});
