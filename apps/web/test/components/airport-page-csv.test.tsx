import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AirportPage } from "../../src/pages/AirportPage";
import { CAPTURED_AT, json, stubFetch } from "../a11y/fixtures";

const status = {
  state: "ok",
  capturedAt: CAPTURED_AT,
  stale: false,
  airport: { airportId: "ATL", name: "Atlanta Hartsfield-Jackson", groundStop: null },
  events: [],
};
const events = [
  { incidentKey: "evt-1", type: "GROUND_STOP_STARTED", airportId: "ATL", occurredAt: new Date().toISOString(), explanation: '=Storms, "heavy"' },
];

function routes(list: unknown[]) {
  return stubFetch({
    "GET /api/status/airport/ATL": () => json(status),
    "GET /api/history/ATL": () => json({ airportId: "ATL", events: list }),
  });
}

const blobs: Blob[] = [];
let clicked: string[] = [];

beforeEach(() => {
  blobs.length = 0;
  clicked = [];
  URL.createObjectURL = vi.fn((b: Blob | MediaSource) => {
    blobs.push(b as Blob);
    return "blob:test";
  });
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    clicked.push(this.download);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function readBytes(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsArrayBuffer(blob);
  });
}

describe("AirportPage CSV download", () => {
  it("hides the button when there are no events", async () => {
    routes([]);
    render(<AirportPage airportId="ATL" />);
    await screen.findByText("No events for this airport in the last 24 hours.");
    expect(screen.queryByRole("button", { name: "Download CSV" })).toBeNull();
  });

  it("downloads the events as a CSV without another fetch", async () => {
    const fetchMock = routes(events);
    render(<AirportPage airportId="ATL" />);
    const button = await screen.findByRole("button", { name: "Download CSV" });
    const before = fetchMock.mock.calls.length;
    fireEvent.click(button);
    expect(fetchMock.mock.calls.length).toBe(before);
    expect(blobs).toHaveLength(1);
    const blob = blobs[0] as Blob;
    expect(blob.type).toBe("text/csv;charset=utf-8");
    const bytes = await readBytes(blob);
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes);
    expect(text.startsWith("\uFEFFtime_utc,type,airport,explanation\r\n")).toBe(true);
    expect(text).toContain(`"'=Storms, ""heavy"""`);
    const date = new Date().toISOString().slice(0, 10);
    expect(clicked).toEqual([`aerobrief-ATL-${date}.csv`]);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test");
  });
});
