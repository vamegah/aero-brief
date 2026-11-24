import { AIRPORTS } from "@aerobrief/core/airports";
import { WATCHLIST_CAP } from "@aerobrief/core/watchlist";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StatusView } from "../../src/components/StatusView";
import { matchesAirportSearch } from "../../src/lib/airport-search";
import { WatchlistPage } from "../../src/pages/WatchlistPage";
import { AIRPORT_COUNT, AIRPORT_IDS, jsonResponse, okStatus, type FetchFn } from "./fixtures";

let watchlist: string[];

beforeEach(() => {
  watchlist = [];
  vi.stubGlobal(
    "fetch",
    vi.fn<FetchFn>((input) => {
      if (String(input) === "/api/status/national") return Promise.resolve(jsonResponse(okStatus()));
      return Promise.resolve(jsonResponse({ watchlist }));
    }),
  );
  window.history.replaceState(null, "", "/#airports");
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("Watchlist counter with the 30-airport cap", () => {
  it("is 30, the same as the shared WATCHLIST_CAP", async () => {
    // MAX_WATCHLIST is module-private; the rendered counter is the observable value.
    expect(WATCHLIST_CAP).toBe(30);
    watchlist = [...AIRPORT_IDS];
    render(<WatchlistPage />);
    expect(await screen.findByText(`${WATCHLIST_CAP} of ${WATCHLIST_CAP} airports watched`)).not.toBeNull();
  });

  it.each([
    [0, "0 of 30 airports watched"],
    [1, "1 of 30 airports watched"],
    [30, "30 of 30 airports watched"],
  ])("reads the right text with %i airports", async (count, text) => {
    watchlist = AIRPORT_IDS.slice(0, count);
    render(<WatchlistPage />);
    expect(await screen.findByText(text)).not.toBeNull();
  });
});

describe("New airports in the web app", () => {
  it("lists BWI in the dashboard rows and finds it with the search field", () => {
    const { container } = render(<StatusView status={okStatus()} events={[]} loading={false} />);
    const ids = Array.from(container.querySelectorAll("tbody tr th")).map((th) => th.textContent);
    expect(ids).toContain("BWI");
    expect(screen.getByRole("button", { name: `All (${AIRPORT_COUNT})` })).not.toBeNull();
    fireEvent.change(screen.getByLabelText("Search airports"), { target: { value: "bwi" } });
    expect(Array.from(container.querySelectorAll("tbody tr th")).map((th) => th.textContent)).toEqual(["BWI"]);
  });

  it("offers BWI in the watchlist table", async () => {
    render(<WatchlistPage />);
    expect(await screen.findByRole("button", { name: "Add Airport BWI to watchlist" })).not.toBeNull();
  });
});

describe("matchesAirportSearch for the ten New_Airports", () => {
  const fragments: Record<string, string> = {
    BWI: "baltimore",
    CLT: "charlotte",
    FLL: "lauderdale",
    HNL: "honolulu",
    IAD: "dulles",
    LGA: "laguardia",
    MDW: "midway",
    PHL: "philadelphia",
    SAN: "san diego",
    TPA: "tampa",
  };

  it.each(Object.entries(fragments))("%s is found by its code and by %s", (id, fragment) => {
    const airport = AIRPORTS.find((a) => a.id === id);
    expect(airport).toBeDefined();
    const summary = { airportId: id, name: airport?.name ?? "" };
    expect(matchesAirportSearch(summary, id.toLowerCase())).toBe(true);
    expect(matchesAirportSearch(summary, fragment)).toBe(true);
  });
});
