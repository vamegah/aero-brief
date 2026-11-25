import type { EventSummary } from "../api/client";
import { EVENT_TYPE_LABELS, type KnownEventType } from "../lib/event-types";
import { Icon, type IconName } from "./Icon";
import { TimeText } from "./TimeText";

const TYPE_ICON: Record<KnownEventType, IconName> = {
  GROUND_STOP_STARTED: "alert",
  GROUND_STOP_ENDED: "check",
  NATIONWIDE_EVENT: "info",
};

function isKnownType(type: string): type is KnownEventType {
  return Object.prototype.hasOwnProperty.call(EVENT_TYPE_LABELS, type);
}

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
  const { label, icon }: { label: string; icon: IconName } = isKnownType(event.type)
    ? { label: EVENT_TYPE_LABELS[event.type], icon: TYPE_ICON[event.type] }
    : FALLBACK;
  return (
    <div className={`event-card ${MODIFIER[event.type] ?? ""}`.trim()}>
      <div className="event-card__header">
        <div className="event-card__title">
          <Icon name={icon} />
          <span className="event-card__type">{label}</span>
          {event.airportId !== null ? <strong className="event-card__airport">{event.airportId}</strong> : null}
        </div>
        <span className="event-card__time">
          <TimeText iso={event.occurredAt} airportId={event.airportId ?? undefined} />
        </span>
      </div>
      {duration !== undefined ? <p className="event-card__duration">{duration}</p> : null}
      <p className="event-card__explanation">{event.explanation}</p>
    </div>
  );
}
