import type { EventSummary } from "../api/client";
import { formatUtc } from "../lib/format-time";
import { Icon, type IconName } from "./Icon";

const TYPE_PRESENTATION: Record<string, { label: string; icon: IconName }> = {
  GROUND_STOP_STARTED: { label: "Ground stop started", icon: "alert" },
  GROUND_STOP_ENDED: { label: "Ground stop ended", icon: "check" },
  NATIONWIDE_EVENT: { label: "System-wide disruption", icon: "info" },
};

const FALLBACK = { label: "Event", icon: "plane" } as const;

export interface EventCardProps {
  event: EventSummary;
}

/**
 * Content of one EventList item: decorative icon, a text type label, the airport when present,
 * the Explanation exactly as received (own element), and the Event time.
 */
export function EventCard({ event }: EventCardProps) {
  const { label, icon } = TYPE_PRESENTATION[event.type] ?? FALLBACK;
  return (
    <div className="event-card">
      <div className="event-card__header">
        <Icon name={icon} />
        <span className="event-card__type">{label}</span>
        {event.airportId !== null ? <strong className="event-card__airport">{event.airportId}</strong> : null}
        <time className="event-card__time" dateTime={event.occurredAt}>
          {formatUtc(event.occurredAt)}
        </time>
      </div>
      <p className="event-card__explanation">{event.explanation}</p>
    </div>
  );
}
