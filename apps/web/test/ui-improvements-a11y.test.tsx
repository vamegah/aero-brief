import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EventSummary } from "../src/api/client";
import { MergeOffer } from "../src/components/MergeOffer";
import { StaleDataBanner } from "../src/components/StaleDataBanner";
import { StatusView } from "../src/components/StatusView";
import { LOCAL_WATCHLIST_KEY } from "../src/lib/local-watchlist";
import shellCss from "../src/styles/shell.css?raw";
import { apiError, stubFetch } from "./a11y/fixtures";
import { okStatus } from "./components/fixtures";

// ui-improvements task 23.6. Accessibility assertions that the component tests of earlier tasks do not cover.
// Requirements 17.1 to 17.4.

const STYLE_SOURCES = import.meta.glob("../src/styles/*.css", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/");
});

describe("17.3 focus indicators are at least 2px wide", () => {
  it("the shared focus width token is at least 2px", () => {
    const tokens = STYLE_SOURCES["../src/styles/tokens.css"] ?? "";
    const width = /--focus-outline-width:\s*(\d+)px/.exec(tokens);
    expect(width).not.toBeNull();
    expect(Number(width?.[1])).toBeGreaterThanOrEqual(2);
  });

  it("no stylesheet removes an outline or draws one thinner than 2px", () => {
    const offenders: string[] = [];
    for (const [file, css] of Object.entries(STYLE_SOURCES)) {
      // `(?<![-\w])` skips custom properties such as --focus-outline and outline-offset.
      for (const match of css.matchAll(/(?<![-\w])outline(-width)?\s*:\s*([^;}]+)/g)) {
        const value = (match[2] ?? "").trim();
        if (value === "var(--focus-outline)") continue;
        const px = /^(\d+(?:\.\d+)?)px\b/.exec(value);
        if (px === null || Number(px[1]) < 2) offenders.push(`${file}: outline: ${value}`);
      }
      expect(css, `${file}: outline-style none`).not.toMatch(/outline-style\s*:\s*none/);
    }
    expect(offenders).toEqual([]);
  });
});

describe("17.2 the current page is not shown by color alone", () => {
  it("the Sign in button gets a thicker bottom border when it is the current page, like the plain links", () => {
    const rule = /\.nav-bar a\.nav-bar__signin\[aria-current="page"\]\s*\{([^}]*)\}/.exec(shellCss);
    expect(rule).not.toBeNull();
    const width = /border-bottom-width:\s*(\d+)px/.exec(rule?.[1] ?? "");
    expect(Number(width?.[1])).toBeGreaterThanOrEqual(3);
  });
});

describe("17.4 live regions", () => {
  it("keeps the ticking relative time in the stale banner out of its polite live region", () => {
    render(<StaleDataBanner capturedAt="2026-01-02T11:00:00.000Z" />);
    const time = document.querySelector("time") as HTMLElement;
    expect(time.closest("[aria-live]")?.getAttribute("aria-live")).toBe("off");
  });

  it("the Status page has no assertive region, and its counts are polite and keep one node as they change", () => {
    window.history.replaceState(null, "", "/#events");
    const events: EventSummary[] = [
      { incidentKey: "a", type: "GROUND_STOP_STARTED", airportId: "ATL", occurredAt: "2026-01-02T10:00:00.000Z", explanation: "raw" },
    ];
    const { container } = render(<StatusView status={okStatus({ stale: true })} events={events} loading={false} />);
    expect(container.querySelector("[aria-live='assertive'], [role='alert']")).toBeNull();
    const count = container.querySelector(".event-count") as HTMLElement;
    expect(count.getAttribute("aria-live")).toBe("polite");
    expect(count.textContent).toBe("Showing 1 of 1 incidents");
    fireEvent.change(screen.getByLabelText("State"), { target: { value: "ended" } });
    expect(container.querySelector(".event-count")).toBe(count);
    expect(count.textContent).toBe("Showing 0 of 1 incidents");
  });

  it("the sign-in merge offer reports a failure inside the polite status region, not as an alert", async () => {
    window.localStorage.setItem(LOCAL_WATCHLIST_KEY, JSON.stringify(["ATL"]));
    stubFetch({ "POST /api/watchlist": () => apiError(500, "server_error", "The server failed.") });
    const { container } = render(
      <div role="status" className="merge-offer">
        <MergeOffer account={["JFK"]} onMerged={() => undefined} />
      </div>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add to my account" }));
    const message = await screen.findByText("The server failed.");
    expect(container.querySelector("[role='alert'], [aria-live='assertive']")).toBeNull();
    expect(message.closest("[role='status']")).not.toBeNull();
  });
});

describe("17.3 a cleared control hands focus to the field it cleared", () => {
  beforeEach(() => window.history.replaceState(null, "", "/#airports"));

  it("Clear search returns focus to the search field", () => {
    render(<StatusView status={okStatus()} events={[]} loading={false} />);
    const input = screen.getByLabelText("Search airports") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "zzzz" } });
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(document.activeElement).toBe(input);
  });

  it("Clear filters in the empty Airports state returns focus to the search field", () => {
    render(<StatusView status={okStatus()} events={[]} loading={false} />);
    const input = screen.getByLabelText("Search airports") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "zzzz" } });
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(input.value).toBe("");
    expect(document.activeElement).toBe(input);
  });

  it("Clear filters in the empty Events state returns focus to the first filter", () => {
    window.history.replaceState(null, "", "/#events");
    const events: EventSummary[] = [
      { incidentKey: "a", type: "GROUND_STOP_STARTED", airportId: "ATL", occurredAt: "2026-01-02T10:00:00.000Z", explanation: "raw" },
    ];
    render(<StatusView status={okStatus()} events={events} loading={false} />);
    const airport = screen.getByLabelText("Airport") as HTMLSelectElement;
    fireEvent.change(airport, { target: { value: "LAX" } });
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(airport.value).toBe("");
    expect(document.activeElement).toBe(airport);
  });
});
