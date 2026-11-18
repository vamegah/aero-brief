import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageHeader } from "../../src/components/PageHeader";
import { StatusView } from "../../src/components/StatusView";
import { SummaryCard, overallStatusText } from "../../src/components/SummaryCard";
import { CAPTURED_AT, CAPTURED_TEXT, makeAirports, okStatus } from "./fixtures";

describe("PageHeader", () => {
  it("renders an h2 title, optional subtitle and action", () => {
    const { container } = render(<PageHeader title="National status" subtitle="Sub" action={<span>Act</span>} />);
    expect(container.querySelector("h2")?.textContent).toBe("National status");
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
    expect(text).toContain("Affected ARTCCs: 0");
    expect(text).toContain(`Last updated ${CAPTURED_TEXT}`);
    expect(container.querySelector("time")?.getAttribute("dateTime")).toBe(CAPTURED_AT);
    expect(container.querySelectorAll(".metric-chip")).toHaveLength(3);
  });

  it("derives the overall status text", () => {
    expect(overallStatusText(0, false)).toBe("Normal");
    expect(overallStatusText(2, false)).toBe("Ground stops active");
    expect(overallStatusText(0, true)).toBe("System-wide disruption");
    expect(overallStatusText(2, true)).toBe("System-wide disruption");
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
    expect(card!.textContent).toContain("Affected ARTCCs: 4");
    expect(card!.textContent).toContain("System-wide disruption");
    expect(card!.textContent?.toLowerCase()).not.toContain("map");
  });
});
