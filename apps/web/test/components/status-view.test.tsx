import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusView } from "../../src/components/StatusView";
import { CAPTURED_TEXT, makeAirports, okStatus } from "./fixtures";

function follows(a: Element, b: Element): boolean {
  return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

describe("StatusView", () => {
  it("renders the stale banner with its time, above the list", () => {
    const { container, getByTestId } = render(
      <StatusView status={okStatus({ stale: true })} events={[]} loading={false} />,
    );
    const banner = getByTestId("stale-data-banner");
    expect(banner.textContent).toContain(CAPTURED_TEXT);
    const table = container.querySelector("table");
    expect(table).not.toBeNull();
    expect(follows(banner, table as Element)).toBe(true);
  });

  it("omits the stale banner when data is fresh", () => {
    const { queryByTestId } = render(<StatusView status={okStatus()} events={[]} loading={false} />);
    expect(queryByTestId("stale-data-banner")).toBeNull();
  });

  it("renders 20 airport rows and no map", () => {
    const airports = makeAirports().map((airport) => ({
      ...airport,
      groundStop: airport.airportId === "SEA" || airport.airportId === "LAX" ? { reasonText: "x" } : null,
    }));
    const { container } = render(<StatusView status={okStatus({ airports })} events={[]} loading={false} />);
    expect(container.querySelectorAll("tbody tr")).toHaveLength(20);
    const ids = Array.from(container.querySelectorAll("tbody tr th")).map((th) => th.textContent);
    expect(ids.slice(0, 2)).toEqual(["LAX", "SEA"]);
    expect(ids.slice(2)).toEqual([...ids.slice(2)].sort());
    expect(container.querySelector("canvas, iframe, svg, img, [role='map'], [class*='map' i]")).toBeNull();
    expect(container.textContent?.toLowerCase()).not.toContain("map");
  });

  it("shows the system-wide banner only when nationwide.active, above the table", () => {
    const active = okStatus({ nationwide: { active: true, count: 6, artccs: ["ZNY"], explanation: "Widespread stops." } });
    const { container, queryByTestId, rerender } = render(<StatusView status={active} events={[]} loading={false} />);
    const banner = queryByTestId("system-wide-banner");
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain("Widespread stops.");
    expect(follows(banner as Element, container.querySelector("table") as Element)).toBe(true);

    rerender(<StatusView status={okStatus()} events={[]} loading={false} />);
    expect(queryByTestId("system-wide-banner")).toBeNull();
  });

  it("inserts banner text into the live region without moving focus", () => {
    const { container, getByTestId, rerender } = render(
      <div>
        <button type="button">outside</button>
        <StatusView status={okStatus()} events={[]} loading={false} />
      </div>,
    );
    const button = container.querySelector("button") as HTMLButtonElement;
    button.focus();
    expect(document.activeElement).toBe(button);
    const live = container.querySelector("[aria-live]") as HTMLElement;
    expect(live.getAttribute("aria-live")).toBe("polite");
    expect(live.textContent).toBe("");

    rerender(
      <div>
        <button type="button">outside</button>
        <StatusView
          status={okStatus({ stale: true, nationwide: { active: true, count: 6, artccs: [], explanation: "Big." } })}
          events={[]}
          loading={false}
        />
      </div>,
    );
    expect(live.isConnected).toBe(true);
    expect(live.contains(getByTestId("stale-data-banner"))).toBe(true);
    expect(live.contains(getByTestId("system-wide-banner"))).toBe(true);
    expect(document.activeElement).toBe(button);
    fireEvent.blur(button);
  });
});
