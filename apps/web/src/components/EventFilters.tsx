import { EVENT_TYPES, EVENT_TYPE_LABELS } from "../lib/event-types";
import type { EventFilter } from "../lib/filter-events";
import { FormLabel } from "./FormLabel";

export interface EventFiltersProps {
  /** The Monitored_Airports. The component sorts a copy by code. */
  airports: readonly { airportId: string; name: string }[];
  value: EventFilter;
  onChange: (next: EventFilter) => void;
}

/** Two native selects. The value "" means "All airports" or "All types". */
export function EventFilters({ airports, value, onChange }: EventFiltersProps) {
  const sorted = [...airports].sort((a, b) => (a.airportId < b.airportId ? -1 : a.airportId > b.airportId ? 1 : 0));
  return (
    <div role="group" aria-label="Filter events" className="event-filters">
      <div className="event-filters__field">
        <FormLabel htmlFor="event-filter-airport">Airport</FormLabel>
        <select
          id="event-filter-airport"
          value={value.airportId ?? ""}
          onChange={(event) => onChange({ ...value, airportId: event.target.value === "" ? null : event.target.value })}
        >
          <option value="">All airports</option>
          {sorted.map((airport) => (
            <option key={airport.airportId} value={airport.airportId}>
              {`${airport.airportId} – ${airport.name}`}
            </option>
          ))}
        </select>
      </div>
      <div className="event-filters__field">
        <FormLabel htmlFor="event-filter-type">Event type</FormLabel>
        <select
          id="event-filter-type"
          value={value.type ?? ""}
          onChange={(event) => onChange({ ...value, type: event.target.value === "" ? null : event.target.value })}
        >
          <option value="">All types</option>
          {EVENT_TYPES.map((type) => (
            <option key={type} value={type}>
              {EVENT_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
