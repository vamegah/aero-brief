// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EventCard } from "../../src/components/EventCard";
import { EventList } from "../../src/components/EventList";
import { useUtcDisplayMode } from "./fixtures";

useUtcDisplayMode();

const base = {
  incidentKey: "evt-1",
  type: "GROUND_STOP_STARTED",
  airportId: "JFK",
  occurredAt: "2024-06-01T12:00:00.000Z",
  explanation: "  A ground stop started at JFK: delays.  ",
};

describe("EventCard", () => {
  it("renders the Explanation verbatim in its own element", () => {
    const { container } = render(<EventCard event={base} />);
    expect(container.querySelector(".event-card__explanation")?.textContent).toBe(base.explanation);
  });

  it("renders a time element with dateTime and formatted text", () => {
    const { container } = render(<EventCard event={base} />);
    const time = container.querySelector("time");
    expect(time?.getAttribute("datetime")).toBe(base.occurredAt);
    expect(time?.textContent).toBe("Jun 1, 2024, 12:00 UTC");
  });

  it("has an aria-hidden icon and no svg or img", () => {
    const { container } = render(<EventCard event={base} />);
    expect(container.querySelector("span.icon[aria-hidden='true']")).not.toBeNull();
    expect(container.querySelector("svg, img")).toBeNull();
  });

  it.each([
    ["GROUND_STOP_STARTED", "Ground stop started"],
    ["GROUND_STOP_ENDED", "Ground stop ended"],
    ["NATIONWIDE_EVENT", "System-wide disruption"],
  ])("shows the text label for %s", (type, label) => {
    const { container } = render(<EventCard event={{ ...base, type }} />);
    expect(container.querySelector(".event-card__type")?.textContent).toBe(label);
  });

  it("omits the airport when null", () => {
    const { container } = render(<EventCard event={{ ...base, airportId: null }} />);
    expect(container.querySelector(".event-card__airport")).toBeNull();
  });
});

describe("EventList", () => {
  it("keeps one li per event in the given order", () => {
    const events = [base, { ...base, type: "GROUND_STOP_ENDED", occurredAt: "2024-06-01T10:00:00.000Z" }];
    const { container } = render(<EventList events={events} />);
    const items = container.querySelectorAll("ul.event-list > li");
    expect(items.length).toBe(2);
    expect(items[0]?.querySelector("time")?.getAttribute("datetime")).toBe(events[0]?.occurredAt);
  });

  it("shows the empty text", () => {
    const { container } = render(<EventList events={[]} />);
    expect(container.textContent).toContain("No events in the last 24 hours.");
  });
});
