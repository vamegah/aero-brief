import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StatusView } from "../../src/components/StatusView";
import { runAxe } from "./axe";
import { NORMAL, okStatus } from "./fixtures";

const AIRPORTS_OK = okStatus() as Extract<ReturnType<typeof okStatus>, { state: "ok" }>;

beforeEach(() => {
  window.history.replaceState(null, "", "/#airports");
});
afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("a11y: status view 'Affected' filter", () => {
  it("has no violations with the filter on and affected airports listed", async () => {
    const { container } = render(<StatusView status={NORMAL} events={[]} loading={false} />);
    const toggle = screen.getByRole("button", { name: /^Affected \(\d+\)$/ });
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(await runAxe(container)).toHaveNoViolations();
  });

  it("has no violations with the filter on and no affected airports", async () => {
    const calm = { ...AIRPORTS_OK, airports: AIRPORTS_OK.airports.map((a) => ({ ...a, groundStop: null })) };
    const { container } = render(<StatusView status={calm} events={[]} loading={false} />);
    fireEvent.click(screen.getByRole("button", { name: /^Affected \(\d+\)$/ }));
    expect(await runAxe(container)).toHaveNoViolations();
  });
});
