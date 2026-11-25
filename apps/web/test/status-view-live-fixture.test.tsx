import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { EventSummary, NationalStatusResponse } from "../src/api/client";
import { StatusView } from "../src/components/StatusView";
import fixture from "./fixtures-live-national-2026-11-25.json";

// ui-review-fixes Task 18.2. Renders StatusView from a real production response (2026-11-25) so the
// wiring between the snapshot and the incident feed is covered. Requirements 18.1, 18.2, 18.3, 18.6.

// ORD ended 22:05Z on the 24th and SFO at 02:20Z on the 25th, so at this `now` both ended more than
// 18 h ago, past the Recovering window of a 40 min stop (about 1 h). Both read as plain ended incidents.
const NOW = new Date("2026-11-25T21:00:00Z");
const { events, ...rest } = fixture as unknown as { events: EventSummary[] } & NationalStatusResponse;
const status = rest as NationalStatusResponse;

afterEach(() => cleanup());

function cardsFor(pane: HTMLElement, code: string): HTMLElement[] {
  return Array.from(pane.querySelectorAll<HTMLElement>(".incident-card")).filter(
    (card) => card.querySelector(".event-card__airport")?.textContent === code,
  );
}

describe("StatusView with the live fixture", () => {
  const panes = [
    ["Overview Latest events", "status-pane-overview"],
    ["Events pane", "status-pane-events"],
  ] as const;

  for (const [label, id] of panes) {
    describe(label, () => {
      it("shows one ended ORD incident of 40 min and no active or unknown-start ORD card", () => {
        const { container } = render(<StatusView status={status} events={events} loading={false} now={NOW} />);
        const pane = container.querySelector<HTMLElement>(`#${id}`) as HTMLElement;
        const ord = cardsFor(pane, "ORD");
        expect(ord).toHaveLength(1);
        const text = ord[0]?.textContent ?? "";
        expect(text).toContain("Ended");
        // 21:25:31 to 22:05:29 is 39 min 58 s; formatDurationText floors, so the UI says 39 min.
        expect(text).toContain("lasted 39 min");
        expect(text).not.toContain("Active for");
        expect(text).not.toContain("Started more than 24 hours ago");
      });

      it("shows one ended SFO incident of 24 min", () => {
        const { container } = render(<StatusView status={status} events={events} loading={false} now={NOW} />);
        const pane = container.querySelector<HTMLElement>(`#${id}`) as HTMLElement;
        const sfo = cardsFor(pane, "SFO");
        expect(sfo).toHaveLength(1);
        const text = sfo[0]?.textContent ?? "";
        expect(text).toContain("Ended");
        // 01:55:29.727 to 02:20:29.704 is 24 min 59.98 s; the formatter floors to 24 min.
        expect(text).toContain("lasted 24 min");
        expect(text).not.toContain("Active for");
      });
    });
  }
});
