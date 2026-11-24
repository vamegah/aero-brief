import { fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WatchlistTable } from "../../src/components/WatchlistTable";
import { SignInPage } from "../../src/pages/SignInPage";
import { WatchlistPage } from "../../src/pages/WatchlistPage";
import { AIRPORT_COUNT, jsonResponse, makeAirports, okStatus, type FetchFn } from "./fixtures";

let fetchMock: ReturnType<typeof vi.fn<FetchFn>>;

beforeEach(() => {
  fetchMock = vi.fn<FetchFn>();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("WatchlistTable", () => {
  it("labels watched and unwatched airports with text and real buttons", () => {
    const onAdd = vi.fn<(id: string) => void>();
    const onRemove = vi.fn<(id: string) => void>();
    const { container, getByRole } = render(
      <WatchlistTable airports={makeAirports().slice(0, 2)} watchlist={["ATL"]} disabled={false} onAdd={onAdd} onRemove={onRemove} />,
    );
    const rows = container.querySelectorAll("tbody tr");
    expect(rows[0]?.textContent).toContain("Watching");
    expect(rows[0]?.textContent).not.toContain("Not watching");
    expect(rows[1]?.textContent).toContain("Not watching");

    fireEvent.click(getByRole("button", { name: "Remove Airport ATL from watchlist" }));
    expect(onRemove).toHaveBeenCalledWith("ATL");
    fireEvent.click(getByRole("button", { name: "Add Airport LAX to watchlist" }));
    expect(onAdd).toHaveBeenCalledWith("LAX");
  });
});

describe("WatchlistPage", () => {
  it("shows the API error in role=alert and leaves the list unchanged on a rejected add", async () => {
    const message = "Your watchlist is full (30 airports maximum).";
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      if (url === "/api/status/national") return Promise.resolve(jsonResponse(okStatus()));
      if (url === "/api/watchlist" && init?.method === "POST") {
        return Promise.resolve(jsonResponse({ error: { code: "watchlist_full", message } }, 409));
      }
      return Promise.resolve(jsonResponse({ watchlist: ["ATL"] }));
    });
    const { container, getByRole } = render(<WatchlistPage />);
    const addButton = await waitFor(() => getByRole("button", { name: "Add Airport LAX to watchlist" }));
    await waitFor(() => expect((addButton as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(addButton);

    await waitFor(() => {
      expect((container.querySelector("[role='alert']") as HTMLElement).textContent).toBe(message);
    });
    const labels = Array.from(container.querySelectorAll("tbody tr")).filter((r) => r.textContent?.includes("Not watching"));
    expect(labels).toHaveLength(AIRPORT_COUNT - 1);
    expect(container.querySelectorAll("tbody tr")[0]?.textContent).toContain("Watching");
  });
});

describe("SignInPage", () => {
  it("keeps the entered email and shows the error in role=alert when sending fails", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: { code: "internal", message: "Something went wrong." } }, 500));
    const { container, getByLabelText } = render(<SignInPage />);
    const input = getByLabelText("Email address") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "pilot@example.com" } });
    fireEvent.submit(container.querySelector("form") as HTMLFormElement);

    await waitFor(() => {
      expect((container.querySelector("[role='alert']") as HTMLElement).textContent).toBe("Something went wrong.");
    });
    expect(input.value).toBe("pilot@example.com");
  });
});
