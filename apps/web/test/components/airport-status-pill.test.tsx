import { render } from "@testing-library/react";
import { AIRPORT_STATUS_KINDS, STATUS_CATALOG } from "@aerobrief/core/status-derivation";
import { describe, expect, it } from "vitest";
import primitives from "../../src/styles/primitives.css?raw";
import { AirportStatusPill } from "../../src/components/AirportStatusPill";


describe("AirportStatusPill", () => {
  it.each(AIRPORT_STATUS_KINDS)("renders %s as its catalog label with an aria-hidden mask icon", (kind) => {
    const { container } = render(<AirportStatusPill kind={kind} />);
    const pill = container.firstElementChild as HTMLElement;
    expect(pill.textContent).toBe(STATUS_CATALOG[kind].label);
    expect(pill.className).toContain(`status-pill--${kind.replace(/_/g, "-")}`);
    expect(pill.querySelector(`span.icon.icon--${STATUS_CATALOG[kind].icon}[aria-hidden='true']`)).not.toBeNull();
    expect(pill.querySelector("svg, img")).toBeNull();
  });

  it("gives all six kinds distinct icons, labels and CSS rules", () => {
    const entries = AIRPORT_STATUS_KINDS.map((k) => STATUS_CATALOG[k]);
    expect(new Set(entries.map((e) => e.icon)).size).toBe(6);
    expect(new Set(entries.map((e) => e.label)).size).toBe(6);
    for (const e of entries) expect(primitives).toContain(`.icon--${e.icon} {`);
  });

  it("lets the caller override the text", () => {
    const { container } = render(<AirportStatusPill kind="recovering" text="Recovering, 3 hours ago" />);
    expect((container.firstElementChild as HTMLElement).textContent).toBe("Recovering, 3 hours ago");
  });
});
