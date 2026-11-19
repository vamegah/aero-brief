import { fireEvent, render, screen, waitFor, type RenderResult } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ALL_FLAGS_OFF } from "../../src/features/features-schema";
import { FeaturesContext } from "../../src/features/use-features";
import { WatchlistPage } from "../../src/pages/WatchlistPage";
import { runAxe } from "./axe";
import { apiError, json, NORMAL, stubFetch, type Routes } from "./fixtures";

// color-contrast is disabled in jsdom (see axe.ts); theme contrast ratios are covered by the themes-contrast tests.

const THEMES = [
  { theme: "light", darkMode: false, highContrast: false },
  { theme: "dark", darkMode: true, highContrast: false },
  { theme: "hc-light", darkMode: false, highContrast: true },
  { theme: "hc-dark", darkMode: true, highContrast: true },
] as const;

const ACTIVE = {
  id: "00000000-0000-4000-8000-000000000001",
  host: "hooks1.example.com",
  createdAt: "2026-01-02T10:00:00.000Z",
  state: "active",
  lastOutcome: null,
  lastOutcomeAt: null,
  disabledAt: null,
};
const DISABLED = {
  ...ACTIVE,
  id: "00000000-0000-4000-8000-000000000002",
  host: "hooks2.example.com",
  state: "disabled",
  lastOutcome: "failed",
  lastOutcomeAt: "2026-01-02T11:30:00.000Z",
  disabledAt: "2026-01-02T11:30:00.000Z",
};

const base = (webhooks: () => Response, extra: Routes = {}): Routes => ({
  "GET /api/status/national": () => json(NORMAL),
  "GET /api/watchlist": () => json({ watchlist: [] }),
  "GET /api/webhooks": webhooks,
  ...extra,
});

describe.each(THEMES)("a11y: Webhooks section, $theme theme", ({ theme, darkMode, highContrast }) => {
  beforeEach(() => {
    if (theme !== "light") document.documentElement.dataset.theme = theme;
  });

  afterEach(() => {
    delete document.documentElement.dataset.theme;
    vi.unstubAllGlobals();
    window.history.pushState({}, "", "/");
  });

  function renderPage(): RenderResult {
    return render(
      <FeaturesContext.Provider value={{ ...ALL_FLAGS_OFF, webhooks: true, darkMode, highContrast }}>
        <WatchlistPage />
      </FeaturesContext.Provider>,
    );
  }

  async function section(): Promise<HTMLElement> {
    return screen.findByRole("region", { name: "Webhooks" });
  }

  it("loading state has no violations", async () => {
    vi.stubGlobal("fetch", (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/webhooks") return new Promise<Response>(() => undefined);
      if (url === "/api/watchlist") return Promise.resolve(json({ watchlist: [] }));
      return Promise.resolve(json(NORMAL));
    });
    const { container } = renderPage();
    await section();
    await screen.findByText("Loading your webhooks…");
    expect(await runAxe(container)).toHaveNoViolations();
  });

  it("empty list has no violations", async () => {
    stubFetch(base(() => json({ webhooks: [] })));
    const { container } = renderPage();
    await screen.findByText("You have no webhooks yet.");
    expect(await runAxe(container)).toHaveNoViolations();
  });

  it("list with one active and one disabled webhook has no violations", async () => {
    stubFetch(base(() => json({ webhooks: [ACTIVE, DISABLED] })));
    const { container } = renderPage();
    await screen.findByText("hooks1.example.com");
    await screen.findByText(/Disabled after repeated failures/);
    expect(await runAxe(container)).toHaveNoViolations();
  });

  it("secret shown once after create has no violations", async () => {
    stubFetch(
      base(() => json({ webhooks: [] }), {
        "POST /api/webhooks": () => json({ ...ACTIVE, secret: "whsec_abc123" }, 201),
      }),
    );
    const { container } = renderPage();
    await screen.findByText("You have no webhooks yet.");
    fireEvent.change(screen.getByLabelText("Webhook URL (https)"), { target: { value: "https://hooks1.example.com/p" } });
    fireEvent.click(screen.getByRole("button", { name: "Add webhook" }));
    await screen.findByDisplayValue("whsec_abc123");
    expect(await runAxe(container)).toHaveNoViolations();
  });

  it("test-event result has no violations", async () => {
    stubFetch(
      base(() => json({ webhooks: [ACTIVE] }), {
        [`POST /api/webhooks/${ACTIVE.id}/test`]: () => json({ outcome: "delivered", status: 200 }),
      }),
    );
    const { container } = renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Send test event to hooks1.example.com" }));
    await waitFor(() => expect(container.textContent).toMatch(/delivered \(HTTP 200\)/));
    expect(await runAxe(container)).toHaveNoViolations();
  });

  it("503 not available has no violations", async () => {
    stubFetch(base(() => apiError(503, "webhooks_not_configured", "Webhooks are not configured.")));
    const { container } = renderPage();
    await screen.findByText("Webhooks are not available right now.");
    expect(await runAxe(container)).toHaveNoViolations();
  });

  it("list error has no violations", async () => {
    stubFetch(base(() => apiError(500, "boom", "Something broke.")));
    const { container } = renderPage();
    await screen.findByText("Something broke.");
    expect(await runAxe(container)).toHaveNoViolations();
  });
});
