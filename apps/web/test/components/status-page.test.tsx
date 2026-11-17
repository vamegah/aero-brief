import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REFRESH_FAILED_TEXT, StatusPage } from "../../src/pages/StatusPage";
import { NOW, jsonResponse, okStatus, type FetchFn } from "./fixtures";

let fetchMock: ReturnType<typeof vi.fn<FetchFn>>;

async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  fetchMock = vi.fn<FetchFn>();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("StatusPage", () => {
  it("refreshes after 60 s and removes the stale banner once data is fresh", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(okStatus({ stale: true })));
    const { queryByTestId } = render(<StatusPage />);
    await advance(0);
    expect(queryByTestId("stale-data-banner")).not.toBeNull();

    await advance(59_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockResolvedValueOnce(jsonResponse(okStatus({ stale: false })));
    await advance(1_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(queryByTestId("stale-data-banner")).toBeNull();
  });

  it("keeps the data and shows an alert when a refresh fails", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(okStatus()));
    const { container } = render(<StatusPage />);
    await advance(0);
    expect(container.querySelectorAll("tbody tr")).toHaveLength(20);

    fetchMock.mockRejectedValueOnce(new Error("network"));
    await advance(60_000);
    expect(container.querySelectorAll("tbody tr")).toHaveLength(20);
    const alert = container.querySelector("[role='alert']") as HTMLElement;
    expect(alert.textContent).toBe(REFRESH_FAILED_TEXT);

    fetchMock.mockResolvedValueOnce(jsonResponse(okStatus()));
    await advance(60_000);
    expect(alert.textContent).toBe("");
  });
});
