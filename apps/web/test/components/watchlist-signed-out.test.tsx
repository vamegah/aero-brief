import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MERGE_DECLINED_KEY } from "../../src/components/MergeOffer";
import { LOCAL_WATCHLIST_KEY, readLocalWatchlist } from "../../src/lib/local-watchlist";
import { WatchlistPage } from "../../src/pages/WatchlistPage";
import { apiError, json, NORMAL, type FetchFn } from "../a11y/fixtures";

const ACCOUNT_NOTE = "The daily digest and email alerts need an account. Everything else here works without one.";

interface Backend {
  /** null means signed out (401). */
  account: string[] | null;
  /** Airport ids whose POST answers 409 watchlist_full. */
  fullFor: Set<string>;
  posts: string[];
}

let backend: Backend;

function installFetch(): void {
  const fetchMock = vi.fn<FetchFn>((input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url === "/api/status/national") return Promise.resolve(json(NORMAL));
    if (url === "/api/watchlist" && method === "GET") {
      return Promise.resolve(
        backend.account === null ? apiError(401, "unauthorized", "Not signed in.") : json({ watchlist: backend.account }),
      );
    }
    if (url === "/api/watchlist" && method === "POST" && backend.account !== null) {
      const { airportId } = JSON.parse(String(init?.body)) as { airportId: string };
      backend.posts.push(airportId);
      if (backend.fullFor.has(airportId)) {
        return Promise.resolve(apiError(409, "watchlist_full", "Your Watchlist already has 30 airports."));
      }
      backend.account = [...backend.account, airportId];
      return Promise.resolve(json({ watchlist: backend.account }));
    }
    return Promise.reject(new Error(`Unexpected request: ${method} ${url}`));
  });
  vi.stubGlobal("fetch", fetchMock);
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  backend = { account: null, fullFor: new Set(), posts: [] };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function renderSignedOut() {
  installFetch();
  const view = render(<WatchlistPage />);
  await screen.findByRole("link", { name: "Sign in" });
  return view;
}

describe("WatchlistPage signed out", () => {
  it("shows a value statement, one primary Sign in, chips, search and the account note, with no error banner", async () => {
    const { container } = await renderSignedOut();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText("Sign in to see your watchlist.")).toBeNull();
    expect(screen.getByText(/Your list stays in this browser/)).not.toBeNull();
    const primaries = container.querySelectorAll(".btn--primary");
    expect(primaries).toHaveLength(1);
    expect(primaries[0]?.textContent).toBe("Sign in");
    expect(primaries[0]?.getAttribute("href")).toBe("/sign-in");
    for (const id of ["ATL", "DFW", "LAS"]) {
      expect(screen.getByRole("button", { name: `Add ${id} to watchlist` })).not.toBeNull();
    }
    expect(screen.getByRole("searchbox", { name: "Search airports" })).not.toBeNull();
    expect(screen.getByText(ACCOUNT_NOTE)).not.toBeNull();
    expect(screen.getByText(/You are not watching any airports yet/)).not.toBeNull();
    expect(screen.getByText("0 of 30 airports watched")).not.toBeNull();
  });

  it("keeps every control enabled next to the account note", async () => {
    await renderSignedOut();
    const buttons = screen.getAllByRole("button") as HTMLButtonElement[];
    expect(buttons.length).toBeGreaterThan(0);
    expect(buttons.every((b) => !b.disabled)).toBe(true);
  });

  it("adds from a chip, saves to browser storage, and removes again, without calling the watchlist API", async () => {
    await renderSignedOut();
    fireEvent.click(screen.getByRole("button", { name: "Add ATL to watchlist" }));
    expect(screen.getByText("1 of 30 airports watched")).not.toBeNull();
    expect(readLocalWatchlist()).toEqual(["ATL"]);
    expect((screen.getByRole("button", { name: "Add ATL to watchlist" }) as HTMLButtonElement).disabled).toBe(true);
    expect(backend.posts).toEqual([]);

    fireEvent.click(screen.getByRole("button", { name: "Remove Atlanta Hartsfield-Jackson from watchlist" }));
    expect(readLocalWatchlist()).toEqual([]);
    expect(screen.getByText(/You are not watching any airports yet/)).not.toBeNull();
  });

  it("adds from search, and lists affected airports first with a one-line explanation and a timestamp", async () => {
    await renderSignedOut();
    fireEvent.click(screen.getByRole("button", { name: "Add ATL to watchlist" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Search airports" }), { target: { value: "jfk" } });
    const results = screen.getByRole("list", { name: "Search results" });
    fireEvent.click(within(results).getByRole("button", { name: /^Add .* to watchlist$/ }));

    const rows = document.querySelectorAll(".watch-list__item");
    expect(rows).toHaveLength(2);
    expect(rows[0]?.textContent).toContain("(JFK)");
    expect(rows[0]?.textContent).toContain("Ground Stop");
    expect(rows[0]?.textContent).toContain("A ground stop is in effect");
    expect(rows[1]?.textContent).toContain("(ATL)");
    expect(rows[1]?.textContent).toContain("Normal");
    expect(screen.getByText(/Sorted by severity/)).not.toBeNull();
    expect(screen.getByText(/Status updated/)).not.toBeNull();
    expect(JSON.parse(window.localStorage.getItem(LOCAL_WATCHLIST_KEY) ?? "[]")).toEqual(["ATL", "JFK"]);
  });

  it("says when a search matches nothing", async () => {
    await renderSignedOut();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search airports" }), { target: { value: "zzzz" } });
    expect(screen.getByText("No airports match your search.")).not.toBeNull();
  });
});

describe("WatchlistPage sign-in merge offer", () => {
  async function renderSignedIn(account: string[], local: string[]) {
    backend.account = account;
    window.localStorage.setItem(LOCAL_WATCHLIST_KEY, JSON.stringify(local));
    installFetch();
    render(<WatchlistPage />);
    await screen.findByText(`${account.length} of 30 airports watched`);
  }

  it("makes no offer when there is no browser list", async () => {
    await renderSignedIn(["JFK"], []);
    expect(screen.queryByRole("button", { name: "Add to my account" })).toBeNull();
  });

  it("adds the missing airports one by one, then clears the browser list", async () => {
    await renderSignedIn(["JFK"], ["ATL", "JFK", "DFW"]);
    expect(screen.getByText(/You saved 3 airports in this browser/)).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add to my account" }));
    expect(await screen.findByText("Added 2 airports to your account.")).not.toBeNull();
    expect(backend.posts).toEqual(["ATL", "DFW"]);
    expect(readLocalWatchlist()).toEqual([]);
    expect(await screen.findByText("3 of 30 airports watched")).not.toBeNull();
  });

  it("makes no offer when the account already holds every saved airport at the cap", async () => {
    const all = ["ATL", "BOS", "BWI", "CLT", "DCA", "DEN", "DFW", "DTW", "EWR", "FLL", "HNL", "IAD", "IAH", "JFK", "LAS", "LAX", "LGA", "MCO", "MDW", "MEM", "MIA", "MSP", "ORD", "PHL", "PHX", "SAN", "SEA", "SFO", "SLC", "TPA"];
    await renderSignedIn(all, ["ATL", "JFK"]);
    expect(screen.queryByRole("button", { name: "Add to my account" })).toBeNull();
  });

  it("counts the rest as not added when the API answers 409 watchlist_full", async () => {
    backend.fullFor = new Set(["DFW"]);
    await renderSignedIn(["JFK"], ["ATL", "DFW", "LAS"]);
    fireEvent.click(screen.getByRole("button", { name: "Add to my account" }));
    expect(await screen.findByText(/Added 1 airport to your account\. 2 airports could not be added/)).not.toBeNull();
    expect(backend.posts).toEqual(["ATL", "DFW"]);
    expect(readLocalWatchlist()).toEqual([]);
  });

  it("keeps the browser list when declined and does not ask again this session", async () => {
    await renderSignedIn(["JFK"], ["ATL"]);
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(screen.queryByRole("button", { name: "Add to my account" })).toBeNull();
    expect(readLocalWatchlist()).toEqual(["ATL"]);
    expect(window.sessionStorage.getItem(MERGE_DECLINED_KEY)).toBe("1");
    expect(backend.posts).toEqual([]);

    render(<WatchlistPage />);
    await waitFor(() => expect(screen.getAllByText("1 of 30 airports watched").length).toBe(2));
    expect(screen.queryByRole("button", { name: "Add to my account" })).toBeNull();
  });
});
