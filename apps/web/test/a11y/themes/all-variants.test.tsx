import { cleanup, render, screen, type RenderResult } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Features } from "../../../src/features/features-schema";
import { FeaturesContext } from "../../../src/features/use-features";
import { AirportPage } from "../../../src/pages/AirportPage";
import { SignInPage } from "../../../src/pages/SignInPage";
import { StatusPage } from "../../../src/pages/StatusPage";
import { SettingsPage } from "../../../src/pages/SettingsPage";
import { UnsubscribePage } from "../../../src/pages/UnsubscribePage";
import { WatchlistPage } from "../../../src/pages/WatchlistPage";
import { runAxe } from "../axe";
import { apiError, CAPTURED_AT, json, NORMAL, stubFetch } from "../fixtures";

// Requirements 8.13, 9.11 and 16.3. Matrix: 15 pages x 4 theme variants = 60 cases, every flag on, zero tolerated
// violations. The pages are Status at each of #overview, #events and #airports, Airport, Watchlist, Sign-in, Unsubscribe, Settings signed in at each of
// #display, #digest, #webhooks and #account, and Settings signed out at each of the same four hashes.
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

const SETTINGS_SECTIONS = [
  { hash: "display", heading: "Display settings" },
  { hash: "digest", heading: "Daily digest" },
  { hash: "webhooks", heading: "Webhooks" },
  { hash: "account", heading: "Account" },
] as const;

const STATUS_SECTIONS = [
  { hash: "overview", heading: "Overview" },
  { hash: "events", heading: "Events in the last 24 hours" },
  { hash: "airports", heading: "Airports" },
] as const;

/** NORMAL plus three events with times computed from now, so they stay inside the 24-hour window. */
function statusWithEvents() {
  const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000).toISOString();
  return {
    ...NORMAL,
    events: [
      { type: "GROUND_STOP_STARTED", airportId: "JFK", occurredAt: minutesAgo(10), explanation: "A ground stop started at JFK." },
      { type: "GROUND_STOP_ENDED", airportId: "ATL", occurredAt: minutesAgo(60), explanation: "The ground stop at ATL ended." },
      { type: "NATIONWIDE_EVENT", airportId: null, occurredAt: minutesAgo(120), explanation: "Ground stops are active at several airports." },
    ],
  };
}

const PAGES: PageCase[] = [
  ...STATUS_SECTIONS.map(
    ({ hash, heading }): PageCase => ({
      name: `Status #${hash}`,
      element: () => <StatusPage />,
      prepare: () => {
        stubFetch({ "GET /api/status/national": () => json(statusWithEvents()) });
        window.history.replaceState(null, "", `/#${hash}`);
      },
      ready: async () => {
        await screen.findByRole("heading", { name: heading });
      },
    }),
  ),
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
    name: "Watchlist",
    element: () => <WatchlistPage />,
    prepare: () =>
      stubFetch({
        "GET /api/status/national": () => json(NORMAL),
        "GET /api/watchlist": () => json({ watchlist: ["JFK"] }),
      }),
    ready: async () => {
      await screen.findByRole("button", { name: "Remove New York JFK from watchlist" });
    },
  },
  ...SETTINGS_SECTIONS.map(
    ({ hash, heading }): PageCase => ({
      name: `Settings #${hash} (signed in)`,
      element: () => <SettingsPage />,
      prepare: () => {
        stubFetch({
          "GET /api/watchlist": () => json({ watchlist: ["JFK"] }),
          "GET /api/digest": () => json({ enabled: true, hour: 18 }),
          "GET /api/webhooks": () => json({ webhooks: [WEBHOOK] }),
        });
        window.history.replaceState(null, "", `/settings#${hash}`);
      },
      ready: async () => {
        await screen.findByRole("heading", { name: heading });
        if (hash === "digest") await screen.findByLabelText("Send at (UTC)");
        if (hash === "webhooks") await screen.findByText("hooks1.example.com");
      },
    }),
  ),
  ...SETTINGS_SECTIONS.map(
    ({ hash, heading }): PageCase => ({
      name: `Settings #${hash} (signed out)`,
      element: () => <SettingsPage />,
      prepare: () => {
        stubFetch({ "GET /api/watchlist": () => apiError(401, "unauthorized", "Sign in required.") });
        window.history.replaceState(null, "", `/settings#${hash}`);
      },
      ready: async () => {
        // The sign-in prompt shows once the session check returns 401. Display is usable without it.
        if (hash === "display") {
          await screen.findByRole("heading", { name: heading });
          await screen.findAllByText("Sign in to manage your settings.");
        } else {
          await screen.findByRole("link", { name: "Go to sign in" });
        }
      },
    }),
  ),
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
