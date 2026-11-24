import { fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { StatusView } from "../../src/components/StatusView";
import { AIRPORT_COUNT, makeAirports, okStatus } from "./fixtures";

beforeEach(() => {
  window.history.replaceState(null, "", "/#airports");
});
afterEach(() => {
  window.history.replaceState(null, "", "/");
});

function setup(status = okStatus()) {
  const utils = render(<StatusView status={status} events={[]} loading={false} />);
  const all = utils.getByRole("button", { name: `All (${AIRPORT_COUNT})` });
  const affected = utils.getByRole("button", { name: "Affected only" });
  return { ...utils, all, affected };
}

describe("Status airport filter", () => {
  it("defaults to All with all rows and aria-pressed state", () => {
    const { container, all, affected, getByRole } = setup();
    expect(container.querySelectorAll("tbody tr")).toHaveLength(AIRPORT_COUNT);
    expect(all.getAttribute("aria-pressed")).toBe("true");
    expect(affected.getAttribute("aria-pressed")).toBe("false");
    expect(getByRole("group", { name: "Filter airports" })).not.toBeNull();
    expect(container.querySelector("[aria-live]")?.contains(all)).toBe(false);
  });

  it("Affected only shows only airports with a ground stop and toggles back", () => {
    const { container, all, affected } = setup();
    fireEvent.click(affected);
    expect(container.querySelectorAll("tbody tr")).toHaveLength(1);
    expect(container.querySelector("tbody tr th")?.textContent).toBe("ATL");
    expect(affected.getAttribute("aria-pressed")).toBe("true");
    expect(all.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(all);
    expect(container.querySelectorAll("tbody tr")).toHaveLength(AIRPORT_COUNT);
  });

  it("keeps the filter across a refresh and shows a message when nothing is affected", () => {
    const { container, affected, rerender } = setup();
    fireEvent.click(affected);
    const clear = okStatus({ airports: makeAirports().map((a) => ({ ...a, groundStop: null })) });
    rerender(<StatusView status={clear} events={[]} loading={false} />);
    expect(container.querySelectorAll("tbody tr")).toHaveLength(0);
    expect(container.textContent).toContain("No airports have an active ground stop.");
    expect(container.querySelector("table")).not.toBeNull();
  });

  it("renders the status pill with the exact status text inside the status cell", () => {
    const { container } = setup();
    const rows = container.querySelectorAll("tbody tr");
    const first = rows[0]?.querySelector("td:last-child") as HTMLElement;
    const second = rows[1]?.querySelector("td:last-child") as HTMLElement;
    expect(first.textContent).toBe("Ground stop");
    expect(second.textContent).toBe("No ground stop reported");
    expect(first.querySelector(".status-pill .icon[aria-hidden='true']")).not.toBeNull();
  });
});
