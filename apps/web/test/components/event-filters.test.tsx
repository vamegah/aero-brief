import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EventFilters } from "../../src/components/EventFilters";
import { NO_EVENT_FILTER } from "../../src/lib/filter-events";

const AIRPORTS = [
  { airportId: "SEA", name: "Seattle-Tacoma" },
  { airportId: "ATL", name: "Atlanta Hartsfield-Jackson" },
  { airportId: "LAX", name: "Los Angeles" },
];

describe("EventFilters", () => {
  it("labels both selects inside a group", () => {
    render(<EventFilters airports={AIRPORTS} value={NO_EVENT_FILTER} onChange={() => {}} />);
    expect(screen.getByRole("group", { name: "Filter events" })).not.toBeNull();
    expect(screen.getByLabelText("Airport").tagName).toBe("SELECT");
    expect(screen.getByLabelText("Event type").tagName).toBe("SELECT");
  });

  it("lists airports sorted by code with name, and does not reorder the input", () => {
    render(<EventFilters airports={AIRPORTS} value={NO_EVENT_FILTER} onChange={() => {}} />);
    const options = Array.from((screen.getByLabelText("Airport") as HTMLSelectElement).options).map((o) => o.text);
    expect(options).toEqual([
      "All airports",
      "ATL – Atlanta Hartsfield-Jackson",
      "LAX – Los Angeles",
      "SEA – Seattle-Tacoma",
    ]);
    expect(AIRPORTS.map((a) => a.airportId)).toEqual(["SEA", "ATL", "LAX"]);
  });

  it("lists the three type labels after All types", () => {
    render(<EventFilters airports={AIRPORTS} value={NO_EVENT_FILTER} onChange={() => {}} />);
    const options = Array.from((screen.getByLabelText("Event type") as HTMLSelectElement).options).map((o) => o.text);
    expect(options).toEqual(["All types", "Ground stop started", "Ground stop ended", "System-wide disruption"]);
  });

  it("calls onChange with the new value and keeps the other one", () => {
    const onChange = vi.fn();
    render(<EventFilters airports={AIRPORTS} value={{ airportId: null, type: "GROUND_STOP_ENDED" }} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Airport"), { target: { value: "ATL" } });
    expect(onChange).toHaveBeenLastCalledWith({ airportId: "ATL", type: "GROUND_STOP_ENDED" });
    fireEvent.change(screen.getByLabelText("Event type"), { target: { value: "" } });
    expect(onChange).toHaveBeenLastCalledWith({ airportId: null, type: null });
  });
});
