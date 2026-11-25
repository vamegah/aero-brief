import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchNationalStatus, type EventSummary, isNationalStatusResponse } from "../../src/api/client";
import { StatusView } from "../../src/components/StatusView";
import { jsonResponse, okStatus, useUtcDisplayMode } from "./fixtures";

// The API on `main` sends events without `incidentKey`. The frontend must still work with it.
useUtcDisplayMode();

const OLD_EVENTS = [
  { type: "GROUND_STOP_ENDED", airportId: "SFO", occurredAt: "2026-01-02T11:30:00.000Z", explanation: "raw" },
  { type: "GROUND_STOP_STARTED", airportId: "SFO", occurredAt: "2026-01-02T10:00:00.000Z", explanation: "raw" },
];

function body(events: unknown[]): unknown {
  return { ...okStatus(), events };
}

/** Distinct texts of the incident cards that name the airport (the pane renders each card more than once). */
function cardTexts(container: HTMLElement, code: string): string[] {
  const texts = Array.from(container.querySelectorAll<HTMLElement>(".incident-card"))
    .map((c) => c.textContent ?? "")
    .filter((text) => text.includes(code));
  return [...new Set(texts)];
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("events without incidentKey", () => {
  it("the client accepts them, and still rejects an empty or non-string key", () => {
    expect(isNationalStatusResponse(body(OLD_EVENTS))).toBe(true);
    expect(isNationalStatusResponse(body([{ ...OLD_EVENTS[0], incidentKey: "" }]))).toBe(false);
    expect(isNationalStatusResponse(body([{ ...OLD_EVENTS[0], incidentKey: 5 }]))).toBe(false);
  });

  it("fetchNationalStatus resolves with such a response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(body(OLD_EVENTS))));
    await expect(fetchNationalStatus()).resolves.toMatchObject({ state: "ok" });
  });

  it("StatusView shows the SFO started and ended pair as one card with a duration", () => {
    window.history.replaceState(null, "", "/#events");
    const { container } = render(
      <StatusView status={okStatus({ events: OLD_EVENTS })} events={OLD_EVENTS} loading={false} />,
    );
    const sfo = cardTexts(container, "SFO");
    expect(sfo).toHaveLength(1);
    expect(sfo[0]).toContain("Ended");
    expect(sfo[0]).toContain("1 h 30 min");
  });

  it("a response with incidentKey groups by that key", () => {
    window.history.replaceState(null, "", "/#events");
    const keyed: EventSummary[] = [
      { ...(OLD_EVENTS[1] as EventSummary), incidentKey: "one" },
      { ...(OLD_EVENTS[0] as EventSummary), incidentKey: "two" }, // a different key: the end is not paired with the start
    ];
    const { container } = render(<StatusView status={okStatus({ events: keyed })} events={keyed} loading={false} />);
    expect(cardTexts(container, "SFO")).toHaveLength(2); // an active card and an ended card, not one pair
  });
});
