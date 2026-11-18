import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AirportPage } from "../../src/pages/AirportPage";
import { runAxe } from "./axe";
import { CAPTURED_AT, json, stubFetch } from "./fixtures";

afterEach(() => vi.unstubAllGlobals());

describe("a11y: airport page CSV button", () => {
  it("has no violations with the Download CSV button shown", async () => {
    stubFetch({
      "GET /api/status/airport/ATL": () =>
        json({
          state: "ok",
          capturedAt: CAPTURED_AT,
          stale: false,
          airport: { airportId: "ATL", name: "Atlanta Hartsfield-Jackson", groundStop: null },
          events: [],
        }),
      "GET /api/history/ATL": () =>
        json({
          airportId: "ATL",
          events: [
            { type: "GROUND_STOP_STARTED", airportId: "ATL", occurredAt: new Date().toISOString(), explanation: "A ground stop started." },
          ],
        }),
    });
    const { container } = render(<AirportPage airportId="ATL" />);
    expect(await screen.findByRole("button", { name: "Download CSV" })).toBeTruthy();
    expect(await runAxe(container)).toHaveNoViolations();
  });
});
