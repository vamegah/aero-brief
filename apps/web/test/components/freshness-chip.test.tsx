import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FreshnessChip } from "../../src/components/FreshnessChip";
import { StatusView } from "../../src/components/StatusView";
import { StatusPage } from "../../src/pages/StatusPage";
import { NOW, jsonResponse, okStatus, type FetchFn } from "./fixtures";

const CAPTURED = "2026-11-13T12:00:00.000Z";

function announcement(container: HTMLElement): string {
  return container.querySelector("[role='status']")?.textContent ?? "";
}

describe("FreshnessChip", () => {
  it.each([
    ["live", "Live"],
    ["delayed", "Delayed"],
    ["unavailable", "Unavailable"],
  ] as const)("shows the text %s with an aria-hidden icon", (freshness, text) => {
    const { container } = render(<FreshnessChip freshness={freshness} capturedAt={null} />);
    expect(screen.getByText(text)).toBeTruthy();
    expect(container.querySelector(".freshness-chip .icon[aria-hidden='true']")).not.toBeNull();
    expect(container.querySelector("time")).toBeNull();
  });

  it("shows the exact timestamp in a tooltip on focus", () => {
    const { container } = render(<FreshnessChip freshness="live" capturedAt={CAPTURED} />);
    const time = container.querySelector("time") as HTMLElement;
    expect(time.getAttribute("datetime")).toBe(CAPTURED);
    const tooltip = container.querySelector("[role='tooltip']") as HTMLElement;
    expect(tooltip.hidden).toBe(true);
    act(() => time.focus());
    expect(tooltip.hidden).toBe(false);
    expect(tooltip.textContent).toContain("UTC");
  });

  it("announces only when the freshness changes", () => {
    const { container, rerender } = render(<FreshnessChip freshness="live" capturedAt={CAPTURED} />);
    expect(announcement(container)).toBe("");
    rerender(<FreshnessChip freshness="live" capturedAt="2026-11-13T12:05:00.000Z" />);
    expect(announcement(container)).toBe("");
    rerender(<FreshnessChip freshness="delayed" capturedAt={CAPTURED} />);
    expect(announcement(container)).toBe("Data freshness: Delayed");
    rerender(<FreshnessChip freshness="delayed" capturedAt={CAPTURED} />);
    expect(announcement(container)).toBe("Data freshness: Delayed");
  });

  it("stays silent and shows loading text while the first request runs", () => {
    const { container, rerender } = render(<FreshnessChip freshness="unavailable" capturedAt={null} loading />);
    expect(screen.getByText("Checking data freshness…")).toBeTruthy();
    expect(container.querySelector("[role='status']")).toBeNull();
    rerender(<FreshnessChip freshness="live" capturedAt={CAPTURED} />);
    expect(announcement(container)).toBe("");
  });

  it("uses a polite status region, never an assertive one", () => {
    const { container } = render(<FreshnessChip freshness="live" capturedAt={CAPTURED} />);
    expect(container.querySelector("[aria-live='assertive'], [role='alert']")).toBeNull();
    expect(container.querySelector("[role='status']")).not.toBeNull();
  });
});

describe("loading skeleton", () => {
  it("renders skeleton blocks next to the visible loading text", () => {
    const { container } = render(<StatusView status={null} events={[]} loading />);
    expect(screen.getByText("Loading status…")).toBeTruthy();
    const group = container.querySelector(".skeleton-group") as HTMLElement;
    expect(group.getAttribute("aria-hidden")).toBe("true");
    expect(group.querySelectorAll(".skeleton").length).toBeGreaterThan(0);
  });
});

describe("StatusPage freshness", () => {
  let fetchMock: ReturnType<typeof vi.fn<FetchFn>>;
  const advance = async (ms: number): Promise<void> => {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  };

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

  it("shows the checking chip while loading, then Live", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(okStatus()));
    const { container } = render(<StatusPage />);
    expect(container.querySelector(".page-header")?.textContent).toContain("Checking data freshness…");
    await advance(0);
    expect(container.querySelector(".page-header .freshness-chip--live")).not.toBeNull();
  });

  it("keeps the data and shows Delayed when a refresh fails, then announces", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(okStatus()));
    const { container } = render(<StatusPage />);
    await advance(0);
    fetchMock.mockRejectedValueOnce(new Error("network"));
    await advance(60_000);
    expect(container.querySelectorAll("tbody tr").length).toBeGreaterThan(0);
    const chip = container.querySelector(".page-header .freshness-chip") as HTMLElement;
    expect(chip.className).toContain("freshness-chip--delayed");
    expect(chip.querySelector("[role='status']")?.textContent).toBe("Data freshness: Delayed");
  });

  it("shows Unavailable when nothing ever loaded", async () => {
    fetchMock.mockRejectedValue(new Error("network"));
    const { container } = render(<StatusPage />);
    await advance(0);
    const chip = container.querySelector(".page-header .freshness-chip") as HTMLElement;
    expect(chip.className).toContain("freshness-chip--unavailable");
    expect(chip.textContent).toContain("Unavailable");
    expect(chip.querySelector("time")).toBeNull();
  });
});
