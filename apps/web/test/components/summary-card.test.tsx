import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageHeader } from "../../src/components/PageHeader";
import { StatusView } from "../../src/components/StatusView";
import { SummaryCard, overallStatusText } from "../../src/components/SummaryCard";
import { CAPTURED_AT, CAPTURED_TEXT, makeAirports, okStatus, useUtcDisplayMode } from "./fixtures";

useUtcDisplayMode();

describe("PageHeader", () => {
  it("renders an h2 title, optional subtitle and action", () => {
    const { container } = render(<PageHeader title="Airport status" subtitle="Sub" action={<span>Act</span>} />);
    expect(container.querySelector("h2")?.textContent).toBe("Airport status");
    expect(container.querySelector("h1")).toBeNull();
    expect(container.textContent).toContain("Sub");
    expect(container.textContent).toContain("Act");
  });

  it("omits subtitle and action when absent", () => {
    const { container } = render(<PageHeader title="T" />);
    expect(container.querySelector(".page-header__subtitle")).toBeNull();
    expect(container.querySelector(".page-header__action")).toBeNull();
  });
});

describe("SummaryCard", () => {
  it("counts ground stops and shows ARTCC count and last updated", () => {
    const airports = makeAirports().map((a, i) => (i < 3 ? { ...a, groundStop: { reasonText: "x" } } : a));
    const { container } = render(
      <SummaryCard airports={airports} nationwide={{ active: false, count: 0 }} capturedAt={CAPTURED_AT} />,
    );
    const text = container.textContent ?? "";
    expect(text).toContain("Overall: Ground stops active");
    expect(text).toContain("Ground stops: 3");
    expect(text).toContain("Regions affected: 0");
    expect(text).not.toContain("Affected ARTCCs");
    expect(text).toContain(`Last updated ${CAPTURED_TEXT}`);
    expect(container.querySelector("time")?.getAttribute("dateTime")).toBe(CAPTURED_AT);
    expect(container.querySelectorAll(".metric-chip")).toHaveLength(3);
  });

  it("offers a keyboard and screen reader reachable definition of a region", () => {
    const { container, getByRole } = render(
      <SummaryCard airports={makeAirports()} nationwide={{ active: false, count: 0 }} capturedAt={CAPTURED_AT} />,
    );
    const trigger = getByRole("button", { name: "What is a region?" });
    const tip = container.querySelector("[role=tooltip].definition-tip__text") as HTMLElement;
    expect(trigger.getAttribute("aria-describedby")).toBe(tip.id);
    expect(tip.textContent).toContain("Air Route Traffic Control Center");
    expect(tip.hidden).toBe(true);
    fireEvent.focus(trigger);
    expect(tip.hidden).toBe(false);
    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(tip.hidden).toBe(true);
  });

  it("derives the overall status text", () => {
    expect(overallStatusText(0, false)).toBe("Normal");
    expect(overallStatusText(2, false)).toBe("Ground stops active");
    expect(overallStatusText(0, true)).toBe("System-wide disruption");
    expect(overallStatusText(2, true)).toBe("System-wide disruption");
  });

  it("uses three decorative tone classes for the three levels", () => {
    const stop = { ...makeAirports()[0]!, groundStop: { reasonText: "x" } };
    const hero = (airports: ReturnType<typeof makeAirports>, active: boolean) =>
      render(<SummaryCard airports={airports} nationwide={{ active, count: 0 }} capturedAt={CAPTURED_AT} />)
        .container.querySelector(".summary-card__hero");
    const calm = makeAirports().map((a) => ({ ...a, groundStop: null }));
    expect(hero(calm, false)?.className).toContain("summary-card__hero--normal");
    expect(hero([stop], false)?.className).toContain("summary-card__hero--warning");
    expect(hero([stop], true)?.className).toContain("summary-card__hero--critical");
  });

  it("sits after the aria-live region and before the table in StatusView", () => {
    const status = okStatus({ nationwide: { active: true, count: 4, artccs: [], explanation: "e" } });
    const { container } = render(<StatusView status={status} events={[]} loading={false} />);
    const live = container.querySelector("[aria-live]");
    const card = container.querySelector(".summary-card");
    const table = container.querySelector("table");
    expect(live && card && table).toBeTruthy();
    expect(live!.compareDocumentPosition(card!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(card!.contains(live!)).toBe(false);
    expect(card!.compareDocumentPosition(table!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(card!.textContent).toContain("Ground stops: 1");
    expect(card!.textContent?.toLowerCase()).not.toContain("map");
  });
});
