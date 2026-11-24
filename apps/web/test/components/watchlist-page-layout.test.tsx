import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WatchlistTable } from "../../src/components/WatchlistTable";
import { FeaturesContext } from "../../src/features/use-features";
import { SettingsPage } from "../../src/pages/SettingsPage";
import { WatchlistPage } from "../../src/pages/WatchlistPage";
import { jsonResponse, makeAirports, okStatus, type FetchFn } from "./fixtures";

let fetchMock: ReturnType<typeof vi.fn<FetchFn>>;
let watchlist: string[];
let deleteStatus: number;

beforeEach(() => {
  watchlist = ["ATL", "LAX"];
  deleteStatus = 204;
  fetchMock = vi.fn<FetchFn>((input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url === "/api/status/national") return Promise.resolve(jsonResponse(okStatus()));
    if (url === "/api/account" && method === "DELETE") {
      return Promise.resolve(
        deleteStatus === 204
          ? new Response(null, { status: 204 })
          : jsonResponse({ error: { code: "internal", message: "Could not delete your account. Try again." } }, deleteStatus),
      );
    }
    if (url.startsWith("/api/watchlist/") && method === "DELETE") {
      const id = url.split("/").pop() ?? "";
      watchlist = watchlist.filter((w) => w !== id);
      return Promise.resolve(jsonResponse({ watchlist }));
    }
    return Promise.resolve(jsonResponse({ watchlist }));
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("WatchlistPage layout", () => {
  it("shows the counter and no watched-airports chip list", async () => {
    render(<WatchlistPage />);
    expect(await screen.findByText("2 of 10 airports watched")).not.toBeNull();
    expect(screen.queryByRole("list", { name: "Watched airports" })).toBeNull();
    expect(screen.queryByText(/^ATL: /)).toBeNull();
    expect(screen.getAllByRole("button", { name: /^Remove / })).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Remove Airport ATL from watchlist" })).not.toBeNull();
  });

  it("removes via the table row and updates the counter", async () => {
    render(<WatchlistPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Remove Airport ATL from watchlist" }));
    expect(await screen.findByText("1 of 10 airports watched")).not.toBeNull();
    expect(screen.queryByRole("list", { name: "Watched airports" })).toBeNull();
    await waitFor(() => expect(screen.getByRole("button", { name: "Add Airport ATL to watchlist" })).not.toBeNull());
  });

  it("shows the empty state at zero airports", async () => {
    watchlist = [];
    render(<WatchlistPage />);
    expect(await screen.findByText("0 of 10 airports watched")).not.toBeNull();
    expect(screen.getByText("You are not watching any airports yet.")).not.toBeNull();
  });

  it("shows loading text first", () => {
    render(<WatchlistPage />);
    expect(screen.getByText("Loading your watchlist…")).not.toBeNull();
  });

  it("keeps add controls enabled at 10 airports", async () => {
    watchlist = ["ATL", "LAX", "ORD", "DFW", "DEN", "JFK", "SFO", "SEA", "LAS", "MCO"];
    render(<WatchlistPage />);
    await screen.findByText("10 of 10 airports watched");
    const add = screen.getByRole("button", { name: "Add Airport EWR to watchlist" }) as HTMLButtonElement;
    await waitFor(() => expect(add.disabled).toBe(false));
  });

  it("no longer shows the Display settings, Daily digest, Webhooks or Account sections", async () => {
    render(
      <FeaturesContext.Provider value={{ darkMode: true, highContrast: true, digests: true, webhooks: true }}>
        <WatchlistPage />
      </FeaturesContext.Provider>,
    );
    await screen.findByText("2 of 10 airports watched");
    for (const name of ["Display settings", "Daily digest", "Webhooks", "Account"]) {
      expect(screen.queryByRole("region", { name })).toBeNull();
    }
    expect(screen.queryByRole("button", { name: "Delete account" })).toBeNull();
    expect(screen.queryByText("Delete account")).toBeNull();
  });

  it("deletes the account on /settings#account through the confirm dialog, and cancel closes it", async () => {
    const assign = vi.fn<(url: string) => void>();
    vi.stubGlobal("location", { ...window.location, assign, hash: "#account" });
    render(<SettingsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Delete account" }));
    const group = await screen.findByRole("group", { name: "Confirm account deletion" });
    fireEvent.click(within(group).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("group", { name: "Confirm account deletion" })).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "Delete account" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm delete account" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/"));
  });
});
describe("WatchlistTable add control for watched airports", () => {
  it("renders only Remove for watched rows and only Add for unwatched rows", () => {
    const { container } = render(
      <WatchlistTable airports={makeAirports().slice(0, 2)} watchlist={["ATL"]} disabled={false} onAdd={vi.fn()} onRemove={vi.fn()} />,
    );
    const rows = container.querySelectorAll("tbody tr");
    expect(rows).toHaveLength(2);
    expect(within(rows[0] as HTMLElement).getAllByRole("button")).toHaveLength(1);
    expect(within(rows[0] as HTMLElement).getByRole("button", { name: "Remove Airport ATL from watchlist" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: /^Add Airport ATL/ })).toBeNull();
    expect(within(rows[1] as HTMLElement).getAllByRole("button")).toHaveLength(1);
    expect((screen.getByRole("button", { name: "Add Airport LAX to watchlist" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByRole("button", { name: /^Remove Airport LAX/ })).toBeNull();
  });

  it("keeps Add enabled on unwatched rows when 10 airports are watched", () => {
    const all = makeAirports();
    const watched = all.slice(0, 10).map((a) => a.airportId);
    render(<WatchlistTable airports={all} watchlist={watched} disabled={false} onAdd={vi.fn()} onRemove={vi.fn()} />);
    const adds = screen.getAllByRole("button", { name: /^Add / }) as HTMLButtonElement[];
    expect(adds).toHaveLength(all.length - 10);
    expect(adds.every((b) => !b.disabled)).toBe(true);
  });
});