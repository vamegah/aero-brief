import { render, screen, type RenderResult } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../../src/App";
import { ALL_FLAGS_OFF } from "../../../src/features/features-schema";
import { FeaturesContext } from "../../../src/features/use-features";
import { AirportPage } from "../../../src/pages/AirportPage";
import { SignInPage } from "../../../src/pages/SignInPage";
import { StatusPage } from "../../../src/pages/StatusPage";
import { UnsubscribePage } from "../../../src/pages/UnsubscribePage";
import { WatchlistPage } from "../../../src/pages/WatchlistPage";
import { runAxe } from "../axe";
import { apiError, CAPTURED_AT, json, NORMAL, stubFetch } from "../fixtures";

// color-contrast is disabled in jsdom (see axe.ts); dark contrast is covered by themes-contrast tests.

beforeEach(() => {
  document.documentElement.dataset.theme = "dark";
});

afterEach(() => {
  delete document.documentElement.dataset.theme;
  vi.unstubAllGlobals();
  window.history.pushState({}, "", "/");
});

function renderDark(ui: ReactElement): RenderResult {
  return render(
    <FeaturesContext.Provider value={{ ...ALL_FLAGS_OFF, darkMode: true }}>{ui}</FeaturesContext.Provider>,
  );
}

describe("a11y: dark theme", () => {
  it("Status page has no violations", async () => {
    stubFetch({ "GET /api/status/national": () => json(NORMAL) });
    const { container } = renderDark(<StatusPage />);
    await screen.findByText("New York JFK");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(await runAxe(container)).toHaveNoViolations();
  });

  it("Airport page has no violations", async () => {
    stubFetch({
      "GET /api/status/airport/ATL": () =>
        json({
          state: "ok",
          capturedAt: CAPTURED_AT,
          stale: true,
          airport: {
            airportId: "ATL",
            name: "Atlanta Hartsfield-Jackson",
            groundStop: { reasonText: "Thunderstorms", expectedEnd: "2026-01-02T14:30:00.000Z", advisoryUrl: null },
          },
          events: [],
        }),
      "GET /api/history/ATL": () => json({ airportId: "ATL", events: [] }),
    });
    const { container } = renderDark(<AirportPage airportId="ATL" />);
    await screen.findByTestId("stale-data-banner");
    expect(await runAxe(container)).toHaveNoViolations();
  });

  it("Watchlist page has no violations", async () => {
    stubFetch({
      "GET /api/status/national": () => json(NORMAL),
      "GET /api/watchlist": () => json({ watchlist: ["JFK"] }),
    });
    const { container } = renderDark(<WatchlistPage />);
    await screen.findByRole("button", { name: "Remove New York JFK from watchlist" });
    expect(await runAxe(container)).toHaveNoViolations();
  });

  it("Sign-in page has no violations", async () => {
    const { container } = renderDark(<SignInPage />);
    expect(await runAxe(container)).toHaveNoViolations();
  });

  it("Unsubscribe page has no violations", async () => {
    window.history.replaceState(null, "", "/unsubscribe?u=user-1&a=JFK&sig=abc");
    const { container } = renderDark(<UnsubscribePage />);
    expect(await runAxe(container)).toHaveNoViolations();
  });

  it("App with the Display settings section has no violations", async () => {
    window.history.pushState({}, "", "/sign-in");
    vi.stubGlobal("fetch", () => Promise.resolve(apiError(401, "unauthorized", "Sign in required.")));
    renderDark(<App />);
    await screen.findByRole("region", { name: "Display settings" });
    await screen.findAllByRole("link", { name: "Sign in" });
    expect(await runAxe(document.body)).toHaveNoViolations();
  });
});
