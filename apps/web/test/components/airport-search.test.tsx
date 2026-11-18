import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusView } from "../../src/components/StatusView";
import { okStatus } from "./fixtures";

function setup() {
  const utils = render(<StatusView status={okStatus()} events={[]} loading={false} />);
  const input = utils.getByLabelText("Search airports") as HTMLInputElement;
  const type = (value: string) => fireEvent.change(input, { target: { value } });
  return { ...utils, input, type };
}

describe("Status airport search", () => {
  it("shows a labelled search field, all 20 rows and the count by default", () => {
    const { container, input } = setup();
    expect(input.type).toBe("search");
    expect(container.querySelectorAll("tbody tr")).toHaveLength(20);
    expect(container.textContent).toContain("Showing 20 of 20 airports");
    expect(container.querySelector("[aria-live]")?.contains(input)).toBe(false);
    expect(container.querySelector("[aria-live]")?.textContent).not.toContain("Showing");
  });

  it("filters by identifier, ignoring case and spaces", () => {
    const { container, type } = setup();
    type("  lax ");
    expect(container.querySelectorAll("tbody tr")).toHaveLength(1);
    expect(container.querySelector("tbody tr th")?.textContent).toBe("LAX");
    expect(container.textContent).toContain("Showing 1 of 20 airports");
  });

  it("filters by name", () => {
    const { container, type } = setup();
    type("airport sfo");
    expect(container.querySelector("tbody tr th")?.textContent).toBe("SFO");
  });

  it("combines with the Affected only filter", () => {
    const { container, type, getByRole } = setup();
    fireEvent.click(getByRole("button", { name: "Affected only" }));
    type("lax");
    expect(container.querySelectorAll("tbody tr")).toHaveLength(0);
    type("atl");
    expect(container.querySelectorAll("tbody tr")).toHaveLength(1);
  });

  it("keeps the table and shows one message when nothing matches", () => {
    const { container, type } = setup();
    type("zzz");
    expect(container.querySelector("table")).not.toBeNull();
    expect(container.querySelectorAll("tbody tr")).toHaveLength(0);
    expect(container.textContent).toContain("No airports match your search.");
    expect(container.textContent).not.toContain("No airports have an active ground stop.");
    expect(container.textContent).toContain("Showing 0 of 20 airports");
  });

  it("makes no API request", () => {
    const calls: unknown[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = ((...args: unknown[]) => {
      calls.push(args);
      return Promise.reject(new Error("unexpected"));
    }) as typeof fetch;
    try {
      const { type } = setup();
      type("atl");
    } finally {
      globalThis.fetch = original;
    }
    expect(calls).toHaveLength(0);
  });
});
