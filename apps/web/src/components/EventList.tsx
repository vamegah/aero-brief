import type { EventSummary } from "../api/client";
import { EmptyState } from "./EmptyState";
import { EventCard } from "./EventCard";

export interface EventListProps {
  /** Already filtered to the last 24 h and ordered newest first. */
  events: readonly EventSummary[];
  /** Optional duration text keyed by index in `events`. Only the airport page passes it. */
  durations?: ReadonlyMap<number, string>;
}

export function EventList({ events, durations }: EventListProps) {
  if (events.length === 0) {
    return <EmptyState text="No events in the last 24 hours." />;
  }
  return (
    <ul className="event-list">
      {events.map((event, index) => (
        <li key={`${event.occurredAt}-${event.type}-${event.airportId ?? "all"}-${index}`}>
          <EventCard event={event} {...(durations?.has(index) ? { duration: durations.get(index) } : {})} />
        </li>
      ))}
    </ul>
  );
}
