import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ALL_FLAGS_OFF, type Features } from "../../src/features/features-schema";
import { FeaturesContext } from "../../src/features/use-features";
import { SettingsPage } from "../../src/pages/SettingsPage";
import { apiError, json, type FetchFn } from "../a11y/fixtures";

const ALL_ON: Features = { darkMode: true, highContrast: true, digests: true, webhooks: true };

type Handler = (init?: RequestInit) => Response;
let handlers: Record<string, Handler>;
let calls: string[];
let fetchMock: ReturnType<typeof vi.fn<FetchFn>>;
let watchlist: string[];

function mount(features: Features, hash = "") {
  window.history.replaceState(null, "", `/settings${hash}`);
  return render(
    <FeaturesContext.Provider value={features}>
      <SettingsPage />
    </FeaturesContext.Provider>,
  );
}

function pane(id: string): HTMLElement {
  const el = document.getElementById(`settings-pane-${id}`);
  if (el === null) throw new Error(`pane ${id} is not mounted`);
  return el;
}

async function goTo(hash: string): Promise<void> {
  await act(async () => {
    window.location.hash = hash;
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  watchlist = ["ATL"];
  calls = [];
  handlers = {
    "GET /api/watchlist": () => json({ watchlist }),
    "GET /api/digest": () => json({ enabled: false, hour: 7 }),
    "GET /api/webhooks": () => json({ webhooks: [] }),
  };
  fetchMock = vi.fn<FetchFn>((input, init) => {
    const method = init?.method ?? "GET";
    const key = `${method} ${String(input)}`;
    calls.push(key);
    const handler = handlers[key];
    if (handler === undefined) return Promise.reject(new Error(`Unexpected request: ${key}`));
    return Promise.resolve(handler(init));
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("SettingsPage menu and visibility", () => {
  it("shows Display and Account when every flag is off", async () => {
    mount(ALL_FLAGS_OFF, "#account");
    const menu = screen.getByRole("navigation", { name: "Settings sections" });
    expect(within(menu).getAllByRole("link").map((a) => a.textContent)).toEqual(["Display", "Account"]);
    expect(await screen.findByRole("button", { name: "Delete account" })).not.toBeNull();
    // The time setting is always available. The theme controls stay behind their flags.
    expect(within(pane("display")).getByRole("group", { name: "Time display", hidden: true })).not.toBeNull();
    expect(within(pane("display")).queryByRole("group", { name: "Theme", hidden: true })).toBeNull();
    expect(calls).not.toContain("GET /api/digest");
    expect(calls).not.toContain("GET /api/webhooks");
  });

  it.each<[string, Partial<Features>, string[]]>([
    ["darkMode", { darkMode: true }, ["Display", "Account"]],
    ["highContrast", { highContrast: true }, ["Display", "Account"]],
    ["digests", { digests: true }, ["Display", "Daily digest", "Account"]],
    ["webhooks", { webhooks: true }, ["Display", "Webhooks", "Account"]],
  ])("shows the menu for the %s flag", async (_name, flags, labels) => {
    mount({ ...ALL_FLAGS_OFF, ...flags });
    const menu = screen.getByRole("navigation", { name: "Settings sections" });
    expect(within(menu).getAllByRole("link").map((a) => a.textContent)).toEqual(labels);
    // Let the session check settle so no request outlives the test.
    await waitFor(() => expect(screen.queryByText("Loading your settings…")).toBeNull());
  });

  it("shows every section with all flags on", () => {
    mount(ALL_ON);
    const menu = screen.getByRole("navigation", { name: "Settings sections" });
    expect(within(menu).getAllByRole("link").map((a) => a.textContent)).toEqual([
      "Display",
      "Daily digest",
      "Webhooks",
      "Account",
    ]);
  });

  it("uses pane ids that differ from the section ids", () => {
    mount(ALL_ON);
    for (const id of ["display", "digest", "webhooks", "account"]) {
      expect(pane(id).id).toBe(`settings-pane-${id}`);
      expect(document.getElementById(id)).toBeNull();
    }
  });
});

describe("SettingsPage active pane", () => {
  it("opens the pane named by the hash on load and marks its link current", async () => {
    mount(ALL_ON, "#webhooks");
    await screen.findByText("You have no webhooks yet.");
    expect(pane("webhooks").hidden).toBe(false);
    expect(pane("display").hidden).toBe(true);
    expect(pane("digest").hidden).toBe(true);
    expect(pane("account").hidden).toBe(true);
    const links = within(screen.getByRole("navigation", { name: "Settings sections" })).getAllByRole("link");
    expect(links.filter((a) => a.getAttribute("aria-current") === "true").map((a) => a.textContent)).toEqual(["Webhooks"]);
  });

  it("falls back to the first visible section for an unknown hash", () => {
    mount(ALL_ON, "#nope");
    expect(pane("display").hidden).toBe(false);
    expect(pane("account").hidden).toBe(true);
  });

  it("switches the pane on hashchange without moving focus", async () => {
    mount(ALL_ON, "#display");
    const link = screen.getByRole("link", { name: "Account" });
    link.focus();
    await goTo("#account");
    expect(pane("account").hidden).toBe(false);
    expect(pane("display").hidden).toBe(true);
    expect(document.activeElement).toBe(link);
    expect(link.getAttribute("aria-current")).toBe("true");
  });

  it("keeps inactive panes mounted, and a hidden section sends no request when its flag is off", async () => {
    mount({ ...ALL_FLAGS_OFF, digests: true }, "#account");
    await screen.findByRole("button", { name: "Delete account" });
    expect(pane("digest").hidden).toBe(true);
    expect(pane("digest").querySelector("#digest-heading")).not.toBeNull();
    expect(calls).toContain("GET /api/digest");
    expect(calls).not.toContain("GET /api/webhooks");
  });

  it("keeps the webhook signing secret after switching away and back", async () => {
    handlers["POST /api/webhooks"] = () =>
      json(
        {
          id: "w1",
          host: "hooks1.example.com",
          createdAt: "2026-01-02T00:00:00.000Z",
          state: "active",
          lastOutcome: null,
          lastOutcomeAt: null,
          disabledAt: null,
          secret: "whsec_abc123",
        },
        201,
      );
    mount(ALL_ON, "#webhooks");
    await screen.findByText("You have no webhooks yet.");
    fireEvent.change(screen.getByLabelText("Webhook URL (https)"), { target: { value: "https://hooks1.example.com/x" } });
    fireEvent.click(screen.getByRole("button", { name: "Add webhook" }));
    await screen.findByDisplayValue("whsec_abc123");

    await goTo("#account");
    expect(pane("webhooks").hidden).toBe(true);
    await goTo("#webhooks");
    expect(pane("webhooks").hidden).toBe(false);
    expect(screen.getByDisplayValue("whsec_abc123")).not.toBeNull();
    expect(calls.filter((c) => c === "GET /api/webhooks")).toHaveLength(1);
  });
});

describe("SettingsPage session states", () => {
  it("shows the loading text in the three session panes and mounts no section while loading", async () => {
    // The shared watchlist request outlives a test, so settle it at the end instead of leaving it pending.
    let release: (response: Response) => void = () => undefined;
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    );
    mount(ALL_ON);
    for (const id of ["digest", "webhooks", "account"]) {
      expect(within(pane(id)).getByText("Loading your settings…")).not.toBeNull();
    }
    expect(screen.getByRole("region", { name: "Display settings" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Delete account" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Daily digest" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Webhooks" })).toBeNull();
    await act(async () => {
      release(json({ watchlist: [] }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  });

  it("signed out: Display works, the other three panes show the sign-in state and mount nothing", async () => {
    handlers["GET /api/watchlist"] = () => apiError(401, "unauthorized", "Sign in required.");
    mount(ALL_ON, "#display");
    for (const id of ["digest", "webhooks", "account"]) {
      expect(await within(pane(id)).findByText("Sign in to manage your settings.")).not.toBeNull();
      const link = within(pane(id)).getByRole("link", { name: "Go to sign in", hidden: true });
      expect(link.getAttribute("href")).toBe("/sign-in");
    }
    expect(screen.getByRole("radio", { name: "Dark" })).not.toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect((screen.getByRole("radio", { name: "Dark" }) as HTMLInputElement).checked).toBe(true);
    expect(screen.queryByRole("button", { name: "Delete account" })).toBeNull();
    expect(calls).toEqual(["GET /api/watchlist"]);
  });

  it("signed out with every flag off: menu has Display and Account, with the sign-in state", async () => {
    handlers["GET /api/watchlist"] = () => apiError(401, "unauthorized", "Sign in required.");
    mount({ ...ALL_FLAGS_OFF });
    const menu = screen.getByRole("navigation", { name: "Settings sections" });
    expect(within(menu).getAllByRole("link").map((a) => a.textContent)).toEqual(["Display", "Account"]);
    expect(await within(pane("account")).findByText("Sign in to manage your settings.")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Delete account" })).toBeNull();
  });

  it("shows other load errors above the menu and keeps every section mounted", async () => {
    handlers["GET /api/watchlist"] = () => apiError(500, "internal", "Could not load your watchlist. Try again.");
    mount(ALL_ON, "#account");
    expect(await screen.findByText("Could not load your watchlist. Try again.")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Delete account" })).not.toBeNull();
    expect(screen.queryByText("Sign in to manage your settings.")).toBeNull();
  });

  it("sends one GET /api/watchlist", async () => {
    mount(ALL_ON, "#digest");
    await screen.findByText("Daily digest", { selector: "h3" });
    await waitFor(() => expect(screen.queryByText("Loading your settings…")).toBeNull());
    expect(calls.filter((c) => c === "GET /api/watchlist")).toHaveLength(1);
  });

  it("shows the digest hint at zero airports", async () => {
    watchlist = [];
    mount({ ...ALL_FLAGS_OFF, digests: true }, "#digest");
    expect(await screen.findByText("Add an airport to receive a digest")).not.toBeNull();
  });
});

describe("SettingsPage account deletion", () => {
  it("deletes the account and goes to the home page", async () => {
    const assign = vi.fn<(url: string) => void>();
    handlers["DELETE /api/account"] = () => new Response(null, { status: 204 });
    mount(ALL_FLAGS_OFF, "#account");
    vi.stubGlobal("location", { ...window.location, assign });
    fireEvent.click(await screen.findByRole("button", { name: "Delete account" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm delete account" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/"));
  });

  it("keeps the user here and shows the error when deletion fails", async () => {
    const assign = vi.fn<(url: string) => void>();
    handlers["DELETE /api/account"] = () => apiError(500, "internal", "Could not delete your account. Try again.");
    mount(ALL_FLAGS_OFF, "#account");
    vi.stubGlobal("location", { ...window.location, assign });
    fireEvent.click(await screen.findByRole("button", { name: "Delete account" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm delete account" }));
    expect(await screen.findByText("Could not delete your account. Try again.")).not.toBeNull();
    expect(assign).not.toHaveBeenCalled();
  });
});
