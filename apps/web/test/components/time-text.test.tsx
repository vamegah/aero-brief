// @vitest-environment jsdom
import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TimeText } from "../../src/components/TimeText";
import { DISPLAY_MODE_KEY, setDisplayMode } from "../../src/hooks/use-display-mode";

const NOW = Date.UTC(2026, 10, 13, 15, 0, 0);
const iso = new Date(NOW - 5 * 60 * 1000).toISOString();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  window.localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  window.localStorage.clear();
});

describe("TimeText", () => {
  it("renders a focusable time element described by a tooltip with three zones", () => {
    const { container } = render(<TimeText iso={iso} airportId="JFK" />);
    const time = container.querySelector("time") as HTMLElement;
    expect(time.getAttribute("datetime")).toBe(iso);
    expect(time.textContent).toBe("5 min ago");
    expect(time.tabIndex).toBe(0);
    const tooltip = document.getElementById(time.getAttribute("aria-describedby") ?? "") as HTMLElement;
    expect(tooltip.getAttribute("role")).toBe("tooltip");
    expect(tooltip.textContent).toContain("Airport local:");
    expect(tooltip.textContent).toContain("Your local:");
    expect(tooltip.textContent).toContain("UTC:");
  });

  it("shows the tooltip on focus, hides it on Escape and on blur, and shows it on tap", () => {
    const { container } = render(<TimeText iso={iso} airportId="JFK" />);
    const time = container.querySelector("time") as HTMLElement;
    const tooltip = container.querySelector("[role=tooltip]") as HTMLElement;
    expect(tooltip.hidden).toBe(true);
    fireEvent.focus(time);
    expect(tooltip.hidden).toBe(false);
    fireEvent.keyDown(time, { key: "Escape" });
    expect(tooltip.hidden).toBe(true);
    fireEvent.click(time);
    expect(tooltip.hidden).toBe(false);
    fireEvent.blur(time);
    expect(tooltip.hidden).toBe(true);
  });

  it("updates relative text after 60 s without a parent re-render", () => {
    const { container } = render(<TimeText iso={iso} />);
    const time = container.querySelector("time") as HTMLElement;
    expect(time.textContent).toBe("5 min ago");
    act(() => {
      vi.advanceTimersByTime(60 * 1000);
    });
    expect(time.textContent).toBe("6 min ago");
  });

  it("uses one shared interval for many instances", () => {
    const spy = vi.spyOn(globalThis, "setInterval");
    render(
      <>
        <TimeText iso={iso} />
        <TimeText iso={iso} />
        <TimeText iso={iso} />
      </>,
    );
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("follows the stored display mode and defaults to relative", () => {
    const { container } = render(<TimeText iso={iso} airportId="JFK" />);
    const time = container.querySelector("time") as HTMLElement;
    expect(time.textContent).toBe("5 min ago");
    act(() => setDisplayMode("utc"));
    expect(window.localStorage.getItem(DISPLAY_MODE_KEY)).toBe("utc");
    expect(time.textContent).toContain("UTC");
  });

  it("shows the raw string when the timestamp is unparseable", () => {
    const { container } = render(<TimeText iso="not-a-date" />);
    expect(container.querySelector("time")?.textContent).toBe("not-a-date");
  });
});
