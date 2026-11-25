import { TimeText } from "./TimeText";

export interface StaleDataBannerProps {
  capturedAt: string;
}

export function StaleDataBanner({ capturedAt }: StaleDataBannerProps) {
  return (
    <p className="banner banner--warn" data-testid="stale-data-banner">
      <strong>Data may be out of date.</strong> Last updated{" "}
      {/* The banner sits in a polite live region. The relative time ticks every minute, and
          aria-live="off" keeps that tick from being announced as a change. */}
      <span aria-live="off">
        <TimeText iso={capturedAt} />
      </span>
      .
    </p>
  );
}
