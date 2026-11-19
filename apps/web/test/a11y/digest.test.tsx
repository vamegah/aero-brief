import { cleanup, fireEvent, render, screen, waitFor, type RenderResult } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../src/App";
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

const base = (digest: () => Response, watchlist: string[] = ["JFK"], extra: Routes = {}): Routes => ({
  "GET /api/status/national": () => json(NORMAL),
  "GET /api/watchlist": () => json({ watchlist }),
  "GET /api/digest": digest,
  ...extra,
});

describe.each(THEMES)("a11y: Daily digest section, $theme theme", ({ theme, darkMode, highContrast }) => {
  beforeEach(() => {
    if (theme !== "light") document.documentElement.dataset.theme = theme;
  });

  afterEach(() => {
    cleanup();
    delete document.documentElement.dataset.theme;
    vi.unstubAllGlobals();
    window.history.pushState({}, "", "/");
  });

  function renderPage(): RenderResult {
    return render(
      <FeaturesContext.Provider value={{ ...ALL_FLAGS_OFF, digests: true, darkMode, highContrast }}>
        <WatchlistPage />
      </FeaturesContext.Provider>,
    );
  }

  it("loading state has no violations", async () => {
    vi.stubGlobal("fetch", (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/digest") return new Promise<Response>(() => undefined);
      if (url === "/api/watchlist") return Promise.resolve(json({ watchlist: ["JFK"] }));
      return Promise.resolve(json(NORMAL));
    });
    const { container } = renderPage();
    await screen.findByRole("region", { name: "Daily digest" });
    await screen.findByText("Loading your digest settings…");
    expect(await runAxe(container)).toHaveNoViolations();
  });

  it("loaded default settings have no violations", async () => {
    stubFetch(base(() => json({ enabled: false, hour: 7 })));
    const { container } = renderPage();
    await screen.findByLabelText("Send at (UTC)");
    expect(await runAxe(container)).toHaveNoViolations();
  });

  it("loaded stored settings have no violations", async () => {
    stubFetch(base(() => json({ enabled: true, hour: 18 })));
    const { container } = renderPage();
    const select = (await screen.findByLabelText("Send at (UTC)")) as HTMLSelectElement;
    expect(select.value).toBe("18");
    expect(await runAxe(container)).toHaveNoViolations();
  });

  it("saved message has no violations", async () => {
    stubFetch(
      base(() => json({ enabled: false, hour: 7 }), ["JFK"], {
        "PUT /api/digest": () => json({ enabled: true, hour: 7 }),
      }),
    );
    const { container } = renderPage();
    fireEvent.click(await screen.findByLabelText("Send me a daily digest"));
    fireEvent.click(screen.getByRole("button", { name: "Save digest settings" }));
    await waitFor(() => expect(screen.getByText("Digest settings saved.")).toBeTruthy());
    expect(await runAxe(container)).toHaveNoViolations();
  });

  it("save error has no violations", async () => {
    stubFetch(
      base(() => json({ enabled: false, hour: 7 }), ["JFK"], {
        "PUT /api/digest": () => apiError(400, "invalid_request", "The request is not valid."),
      }),
    );
    const { container } = renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Save digest settings" }));
    await screen.findAllByText("The request is not valid.");
    expect(await runAxe(container)).toHaveNoViolations();
  });

  it("load error has no violations", async () => {
    stubFetch(base(() => apiError(500, "boom", "Something broke.")));
    const { container } = renderPage();
    await screen.findByText("Something broke.");
    expect(await runAxe(container)).toHaveNoViolations();
  });

  it("empty-watchlist hint has no violations", async () => {
    stubFetch(base(() => json({ enabled: false, hour: 7 }), []));
    const { container } = renderPage();
    await screen.findByText("Add an airport to receive a digest");
    expect(await runAxe(container)).toHaveNoViolations();
  });
});

describe.each(THEMES)("a11y: Digest unsubscribe page, $theme theme", ({ theme, darkMode, highContrast }) => {
  beforeEach(() => {
    if (theme !== "light") document.documentElement.dataset.theme = theme;
  });

  afterEach(() => {
    cleanup();
    delete document.documentElement.dataset.theme;
    vi.unstubAllGlobals();
    window.history.pushState({}, "", "/");
  });

  function open(search: string): RenderResult {
    window.history.pushState({}, "", `/digest/unsubscribe${search}`);
    return render(
      <FeaturesContext.Provider value={{ ...ALL_FLAGS_OFF, digests: true, darkMode, highContrast }}>
        <App />
      </FeaturesContext.Provider>,
    );
  }

  const confirm = () => fireEvent.click(screen.getByRole("button", { name: "Confirm unsubscribe" }));

  it("confirm screen has no violations", async () => {
    stubFetch({ "GET /api/status/national": () => json(NORMAL) });
    const { container } = open("?u=U1&s=SIG");
    await screen.findByRole("button", { name: "Confirm unsubscribe" });
    expect(await runAxe(container)).toHaveNoViolations();
  });

  it("success has no violations", async () => {
    stubFetch({
      "GET /api/status/national": () => json(NORMAL),
      "POST /api/digest/unsubscribe": () => json({ enabled: false }),
    });
    const { container } = open("?u=U1&s=SIG");
    confirm();
    await screen.findByText(/Your daily digest is turned off\./);
    expect(await runAxe(container)).toHaveNoViolations();
  });

  it("invalid link (missing params) has no violations", async () => {
    stubFetch({ "GET /api/status/national": () => json(NORMAL) });
    const { container } = open("");
    await screen.findByText(/This link is invalid or has expired\./);
    expect(await runAxe(container)).toHaveNoViolations();
  });

  it("403 has no violations", async () => {
    stubFetch({
      "GET /api/status/national": () => json(NORMAL),
      "POST /api/digest/unsubscribe": () => apiError(403, "invalid_signature", "bad"),
    });
    const { container } = open("?u=U1&s=SIG");
    confirm();
    await screen.findByText(/This link is invalid or has expired\./);
    expect(await runAxe(container)).toHaveNoViolations();
  });

  it("network error has no violations", async () => {
    stubFetch({
      "GET /api/status/national": () => json(NORMAL),
      "POST /api/digest/unsubscribe": () => {
        throw new TypeError("Failed to fetch");
      },
    });
    const { container } = open("?u=U1&s=SIG");
    confirm();
    await screen.findByText(/Something went wrong\. Try the link again\./);
    expect(await runAxe(container)).toHaveNoViolations();
  });
});
