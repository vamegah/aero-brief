import type { EventSummary } from "../api/client";
import { formatUtc } from "../lib/format-time";

export interface EventListProps {
  /** Already filtered to the last 24 h and ordered newest first. */
  events: readonly EventSummary[];
}

export function EventList({ events }: EventListProps) {
  if (events.length === 0) {
    return <p>No events in the last 24 hours.</p>;
  }
  return (
    <ul className="event-list">
      {events.map((event, index) => (
        <li key={`${event.occurredAt}-${event.type}-${event.airportId ?? "all"}-${index}`}>
          <time dateTime={event.occurredAt}>{formatUtc(event.occurredAt)}</time>
          {event.airportId !== null ? <strong> {event.airportId}</strong> : null}
          <span>: {event.explanation}</span>
        </li>
      ))}
    </ul>
  );
}
