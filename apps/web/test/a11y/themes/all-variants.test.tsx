import { cleanup, render, screen, type RenderResult } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Features } from "../../../src/features/features-schema";
import { FeaturesContext } from "../../../src/features/use-features";
import { AirportPage } from "../../../src/pages/AirportPage";
import { SignInPage } from "../../../src/pages/SignInPage";
import { StatusPage } from "../../../src/pages/StatusPage";
import { UnsubscribePage } from "../../../src/pages/UnsubscribePage";
import { WatchlistPage } from "../../../src/pages/WatchlistPage";
import { runAxe } from "../axe";
import { CAPTURED_AT, json, NORMAL, stubFetch } from "../fixtures";

// Requirements 8.13 and 9.11. Matrix: 5 pages x 4 theme variants, every flag on, zero tolerated violations.
// color-contrast is disabled in jsdom (see axe.ts). Contrast for every variant is covered by the palette pair
// tests (contrast.test.ts over palettePairs in palette.ts) and the themes-contrast tests over themePairs.
// All other axe rules (WCAG 2.1 A and AA) stay on here.

const ALL_FLAGS_ON: Features = { darkMode: true, highContrast: true, digests: true, webhooks: true };

const THEMES = ["light", "dark", "hc-light", "hc-dark"] as const;

const ATL = {
  state: "ok",
  capturedAt: CAPTURED_AT,
  stale: true,
  airport: {
    airportId: "ATL",
    name: "Atlanta Hartsfield-Jackson",
    groundStop: { reasonText: "Thunderstorms", expectedEnd: "2026-01-02T14:30:00.000Z", advisoryUrl: null },
  },
  events: [],
};

const WEBHOOK = {
  id: "00000000-0000-4000-8000-000000000001",
  host: "hooks1.example.com",
  createdAt: "2026-01-02T10:00:00.000Z",
  state: "active",
  lastOutcome: null,
  lastOutcomeAt: null,
  disabledAt: null,
};

interface PageCase {
  name: string;
  element: () => ReactElement;
  prepare: () => void;
  ready: () => Promise<unknown>;
}

const PAGES: PageCase[] = [
  {
    name: "Status",
    element: () => <StatusPage />,
    prepare: () => stubFetch({ "GET /api/status/national": () => json(NORMAL) }),
    ready: () => screen.findByText("New York JFK"),
  },
  {
    name: "Airport",
    element: () => <AirportPage airportId="ATL" />,
    prepare: () =>
      stubFetch({
        "GET /api/status/airport/ATL": () => json(ATL),
        "GET /api/history/ATL": () => json({ airportId: "ATL", events: [] }),
      }),
    ready: () => screen.findByTestId("stale-data-banner"),
  },
  {
    name: "Watchlist with digest and webhook sections",
    element: () => <WatchlistPage />,
    prepare: () =>
      stubFetch({
        "GET /api/status/national": () => json(NORMAL),
        "GET /api/watchlist": () => json({ watchlist: ["JFK"] }),
        "GET /api/digest": () => json({ enabled: true, hour: 18 }),
        "GET /api/webhooks": () => json({ webhooks: [WEBHOOK] }),
      }),
    ready: async () => {
      await screen.findByRole("button", { name: "Remove New York JFK from watchlist" });
      await screen.findByLabelText("Send at (UTC)");
      await screen.findByText("hooks1.example.com");
      await screen.findByRole("region", { name: "Daily digest" });
      await screen.findByRole("region", { name: "Webhooks" });
    },
  },
  {
    name: "Sign-in",
    element: () => <SignInPage />,
    prepare: () => undefined,
    ready: async () => undefined,
  },
  {
    name: "Unsubscribe",
    element: () => <UnsubscribePage />,
    prepare: () => window.history.replaceState(null, "", "/unsubscribe?u=user-1&a=JFK&sig=abc"),
    ready: async () => undefined,
  },
];

describe.each(THEMES)("a11y: all flags on, %s theme", (theme) => {
  beforeEach(() => {
    document.documentElement.dataset.theme = theme;
  });

  afterEach(() => {
    cleanup();
    delete document.documentElement.dataset.theme;
    vi.unstubAllGlobals();
    window.history.pushState({}, "", "/");
  });

  it.each(PAGES)("$name page has no violations", async (page) => {
    page.prepare();
    const { container }: RenderResult = render(
      <FeaturesContext.Provider value={ALL_FLAGS_ON}>{page.element()}</FeaturesContext.Provider>,
    );
    await page.ready();
    expect(document.documentElement.dataset.theme).toBe(theme);
    expect(await runAxe(container)).toHaveNoViolations();
  });
});
