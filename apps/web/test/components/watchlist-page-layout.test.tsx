import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WatchlistTable } from "../../src/components/WatchlistTable";
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
  it("shows the counter and the watched list", async () => {
    render(<WatchlistPage />);
    expect(await screen.findByText("2 of 10 airports watched")).not.toBeNull();
    const list = screen.getByRole("list", { name: "Watched airports" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(within(list).queryAllByRole("button")).toHaveLength(0);
    expect(within(list).getByText(/^ATL: /)).not.toBeNull();
    expect(screen.getAllByRole("button", { name: /^Remove / })).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Remove Airport ATL from watchlist" })).not.toBeNull();
  });

  it("removes via the table row and updates both the counter and the chip list", async () => {
    render(<WatchlistPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Remove Airport ATL from watchlist" }));
    expect(await screen.findByText("1 of 10 airports watched")).not.toBeNull();
    const list = screen.getByRole("list", { name: "Watched airports" });
    await waitFor(() => expect(within(list).getAllByRole("listitem")).toHaveLength(1));
    expect(within(list).queryByText(/^ATL: /)).toBeNull();
    expect(within(list).getByText(/^LAX: /)).not.toBeNull();
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

  it("deletes the account through the confirm dialog, and cancel closes it", async () => {
    const assign = vi.fn<(url: string) => void>();
    vi.stubGlobal("location", { ...window.location, assign });
    render(<WatchlistPage />);
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
  it("renders a disabled Add next to Remove for watched rows and keeps enabled Add for others", () => {
    const { container } = render(
      <WatchlistTable airports={makeAirports().slice(0, 2)} watchlist={["ATL"]} disabled={false} onAdd={vi.fn()} onRemove={vi.fn()} />,
    );
    expect(container.querySelectorAll("tbody tr")).toHaveLength(2);
    const disabledAdd = screen.getByRole("button", { name: "Add Airport ATL to watchlist (already watching)" }) as HTMLButtonElement;
    expect(disabledAdd.disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Add Airport LAX to watchlist" }) as HTMLButtonElement).disabled).toBe(false);
  });
});
