import type { EventSummary } from "../api/client";
import { formatUtc } from "../lib/format-time";
import { Icon, type IconName } from "./Icon";

const TYPE_PRESENTATION: Record<string, { label: string; icon: IconName }> = {
  GROUND_STOP_STARTED: { label: "Ground stop started", icon: "alert" },
  GROUND_STOP_ENDED: { label: "Ground stop ended", icon: "check" },
  NATIONWIDE_EVENT: { label: "System-wide disruption", icon: "info" },
};

const MODIFIER: Record<string, string> = {
  GROUND_STOP_STARTED: "event-card--started",
  GROUND_STOP_ENDED: "event-card--ended",
  NATIONWIDE_EVENT: "event-card--nationwide",
};

const FALLBACK = { label: "Event", icon: "plane" } as const;

export interface EventCardProps {
  event: EventSummary;
  /** Optional text such as "Lasted 1 h 20 min"; rendered only when provided. */
  duration?: string;
}

/**
 * Content of one EventList item: decorative icon, a text type label, the airport when present,
 * the Explanation exactly as received (own element), and the Event time.
 */
export function EventCard({ event, duration }: EventCardProps) {
  const { label, icon } = TYPE_PRESENTATION[event.type] ?? FALLBACK;
  return (
    <div className={`event-card ${MODIFIER[event.type] ?? ""}`.trim()}>
      <div className="event-card__header">
        <div className="event-card__title">
          <Icon name={icon} />
          <span className="event-card__type">{label}</span>
          {event.airportId !== null ? <strong className="event-card__airport">{event.airportId}</strong> : null}
        </div>
        <time className="event-card__time" dateTime={event.occurredAt}>
          {formatUtc(event.occurredAt)}
        </time>
      </div>
      {duration !== undefined ? <p className="event-card__duration">{duration}</p> : null}
      <p className="event-card__explanation">{event.explanation}</p>
    </div>
  );
}
