import { cleanup, fireEvent, render, screen, type RenderResult } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Footer } from "../../../src/components/Footer";
import { NavBar } from "../../../src/components/NavBar";
import type { Features } from "../../../src/features/features-schema";
import { FeaturesContext } from "../../../src/features/use-features";
import { LOCAL_WATCHLIST_KEY } from "../../../src/lib/local-watchlist";
import { AirportPage } from "../../../src/pages/AirportPage";
import { SignInPage } from "../../../src/pages/SignInPage";
import { StatusPage } from "../../../src/pages/StatusPage";
import { SettingsPage } from "../../../src/pages/SettingsPage";
import { UnsubscribePage } from "../../../src/pages/UnsubscribePage";
import { WatchlistPage } from "../../../src/pages/WatchlistPage";
import { runAxe } from "../axe";
import { apiError, CAPTURED_AT, json, NO_DATA, NORMAL, stubFetch } from "../fixtures";

// Requirements 8.13, 9.11, 16.3 and ui-improvements 17.6. Matrix: 27 pages x 4 theme variants = 108 cases, every flag on,
// zero tolerated violations. The pages are Status at each of #overview, #events and #airports, Airport, Watchlist, Sign-in, Unsubscribe, Settings signed in at each of
// #display, #digest, #webhooks and #account, and Settings signed out at each of the same four hashes (the lock state).
// ui-improvements adds 12 screens and states: Overview with recovering and stale, Overview with no data (Data Unavailable),
// Events with every incident card expanded, Events with filters that match nothing, Airports with a search that matches
// nothing, the signed-out Watchlist with items, the sign-in merge offer, Settings Saved and Settings Retry, the nav bar
// with the account menu open, the nav bar with the phone Menu expanded, and the footer.
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
      { incidentKey: "evt-1", type: "GROUND_STOP_STARTED", airportId: "JFK", occurredAt: minutesAgo(10), explanation: "A ground stop started at JFK." },
      { incidentKey: "evt-2", type: "GROUND_STOP_ENDED", airportId: "ATL", occurredAt: minutesAgo(60), explanation: "The ground stop at ATL ended." },
      { incidentKey: "NATIONWIDE:snap-1", type: "NATIONWIDE_EVENT", airportId: null, occurredAt: minutesAgo(120), explanation: "Ground stops are active at several airports." },
    ],
  };
}

const SIGNED_OUT_ROUTE = { "GET /api/watchlist": () => apiError(401, "unauthorized", "Sign in required.") };
const SIGNED_IN_ROUTE = { "GET /api/watchlist": () => json({ watchlist: ["JFK"] }) };

/** Clicks every "Show details" button inside one Status pane. */
function expandIncidentCards(paneId: string): void {
  const buttons = document.querySelectorAll<HTMLButtonElement>(`#${paneId} .incident-card__toggle`);
  expect(buttons.length).toBeGreaterThan(0);
  buttons.forEach((button) => fireEvent.click(button));
  expect(document.querySelectorAll(`#${paneId} .incident-card__details`).length).toBe(buttons.length);
}

/** Settings #digest, signed in, then Save pressed. `put` answers the PUT /api/digest request. */
function digestSaveCase(name: string, put: () => Response, after: () => Promise<unknown>): PageCase {
  return {
    name,
    element: () => <SettingsPage />,
    prepare: () => {
      stubFetch({
        "GET /api/watchlist": () => json({ watchlist: ["JFK"] }),
        "GET /api/digest": () => json({ enabled: true, hour: 18 }),
        "GET /api/webhooks": () => json({ webhooks: [WEBHOOK] }),
        "PUT /api/digest": put,
      });
      window.history.replaceState(null, "", "/settings#digest");
    },
    ready: async () => {
      await screen.findByLabelText("Send at (UTC)");
      fireEvent.click(screen.getByRole("button", { name: "Save digest settings" }));
      await after();
    },
  };
}

/** Screens and states added by ui-improvements (requirement 17.6). */
function UI_IMPROVEMENTS_PAGES(): PageCase[] {
  return [
    {
      name: "Status #overview (recovering and stale)",
      element: () => <StatusPage />,
      prepare: () => {
        stubFetch({ "GET /api/status/national": () => json({ ...statusWithEvents(), stale: true }) });
        window.history.replaceState(null, "", "/#overview");
      },
      ready: async () => {
        await screen.findByRole("heading", { name: "Overview" });
        await screen.findByTestId("stale-data-banner");
        expect(document.querySelector('#status-pane-overview [data-status-kind="recovering"]')).not.toBeNull();
        expect(document.querySelector('#status-pane-overview [data-status-kind="ground_stop"]')).not.toBeNull();
      },
    },
    {
      name: "Status #overview (no data, Data Unavailable)",
      element: () => <StatusPage />,
      prepare: () => {
        stubFetch({ "GET /api/status/national": () => json(NO_DATA) });
        window.history.replaceState(null, "", "/#overview");
      },
      ready: async () => {
        await screen.findByText(NO_DATA.state === "no_data" ? NO_DATA.message : "");
        expect(document.querySelector('[data-status-kind="data_unavailable"]')).not.toBeNull();
      },
    },
    {
      name: "Status #events (incident cards expanded)",
      element: () => <StatusPage />,
      prepare: () => {
        stubFetch({ "GET /api/status/national": () => json(statusWithEvents()) });
        window.history.replaceState(null, "", "/#events");
      },
      ready: async () => {
        await screen.findByRole("heading", { name: "Events in the last 24 hours" });
        expandIncidentCards("status-pane-events");
      },
    },
    {
      name: "Status #events (filters match nothing)",
      element: () => <StatusPage />,
      prepare: () => {
        stubFetch({ "GET /api/status/national": () => json(statusWithEvents()) });
        window.history.replaceState(null, "", "/#events");
      },
      ready: async () => {
        await screen.findByRole("heading", { name: "Events in the last 24 hours" });
        fireEvent.change(screen.getByLabelText("Airport"), { target: { value: "ORD" } });
        await screen.findByText("No events match these filters.");
        expect(screen.getByRole("button", { name: "Clear filters" })).toBeTruthy();
      },
    },
    {
      name: "Status #airports (search matches nothing)",
      element: () => <StatusPage />,
      prepare: () => {
        stubFetch({ "GET /api/status/national": () => json(statusWithEvents()) });
        window.history.replaceState(null, "", "/#airports");
      },
      ready: async () => {
        await screen.findByRole("heading", { name: "Airports" });
        fireEvent.change(screen.getByRole("searchbox", { name: "Search airports" }), { target: { value: "zzzz" } });
        await screen.findByText("No airports match your search.");
        expect(screen.getByRole("button", { name: "Clear search" })).toBeTruthy();
      },
    },
    {
      name: "Watchlist (signed out, with items)",
      element: () => <WatchlistPage />,
      prepare: () => {
        window.localStorage.setItem(LOCAL_WATCHLIST_KEY, JSON.stringify(["ATL", "JFK"]));
        stubFetch({ "GET /api/status/national": () => json(statusWithEvents()), ...SIGNED_OUT_ROUTE });
      },
      ready: async () => {
        await screen.findByRole("link", { name: "Sign in" });
        await screen.findByText(/Sorted by severity/);
        expect(document.querySelectorAll(".watch-list__item")).toHaveLength(2);
      },
    },
    {
      name: "Watchlist (merge offer)",
      element: () => <WatchlistPage />,
      prepare: () => {
        window.localStorage.setItem(LOCAL_WATCHLIST_KEY, JSON.stringify(["ATL", "DFW"]));
        stubFetch({ "GET /api/status/national": () => json(NORMAL), ...SIGNED_IN_ROUTE });
      },
      ready: async () => {
        await screen.findByRole("button", { name: "Add to my account" });
      },
    },
    digestSaveCase("Settings #digest (Saved)", () => json({ enabled: true, hour: 18 }), async () => {
      await screen.findByText("Saved");
    }),
    digestSaveCase("Settings #digest (error with Retry)", () => apiError(500, "server_error", "Could not save."), async () => {
      await screen.findByRole("button", { name: "Retry" });
    }),
    {
      name: "Nav bar (account menu open)",
      element: () => <NavBar pathname="/settings" />,
      prepare: () => stubFetch(SIGNED_IN_ROUTE),
      ready: async () => {
        fireEvent.click(await screen.findByRole("button", { name: "Account" }));
        expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
      },
    },
    {
      name: "Nav bar (phone Menu expanded)",
      element: () => <NavBar pathname="/" />,
      prepare: () => stubFetch(SIGNED_OUT_ROUTE),
      ready: async () => {
        await screen.findByRole("link", { name: "Sign in" });
        fireEvent.click(screen.getByRole("button", { name: "Menu" }));
        expect(screen.getByRole("button", { name: "Menu" }).getAttribute("aria-expanded")).toBe("true");
      },
    },
    {
      name: "Footer",
      element: () => <Footer />,
      prepare: () => undefined,
      ready: async () => {
        expect(screen.getByRole("contentinfo")).toBeTruthy();
      },
    },
  ];
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
  ...UI_IMPROVEMENTS_PAGES(),
];

describe.each(THEMES)("a11y: all flags on, %s theme", (theme) => {
  beforeEach(() => {
    document.documentElement.dataset.theme = theme;
  });

  afterEach(() => {
    cleanup();
    delete document.documentElement.dataset.theme;
    vi.unstubAllGlobals();
    window.localStorage.clear();
    window.sessionStorage.clear();
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
