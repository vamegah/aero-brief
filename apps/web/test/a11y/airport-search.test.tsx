import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusView } from "../../src/components/StatusView";
import { runAxe } from "./axe";
import { NORMAL } from "./fixtures";

describe("a11y: status view airport search", () => {
  it("has no violations with the search field empty", async () => {
    const { container } = render(<StatusView status={NORMAL} events={[]} loading={false} />);
    expect(await runAxe(container)).toHaveNoViolations();
  });

  it("has no violations with matches", async () => {
    const { container } = render(<StatusView status={NORMAL} events={[]} loading={false} />);
    fireEvent.change(screen.getByLabelText("Search airports"), { target: { value: "atl" } });
    expect(await runAxe(container)).toHaveNoViolations();
  });

  it("has no violations when nothing matches", async () => {
    const { container } = render(<StatusView status={NORMAL} events={[]} loading={false} />);
    fireEvent.change(screen.getByLabelText("Search airports"), { target: { value: "zzz" } });
    expect(container.textContent).toContain("No airports match your search.");
    expect(await runAxe(container)).toHaveNoViolations();
  });
});
