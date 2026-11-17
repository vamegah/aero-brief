import { formatUtc } from "../lib/format-time";

export interface StaleDataBannerProps {
  capturedAt: string;
}

export function StaleDataBanner({ capturedAt }: StaleDataBannerProps) {
  return (
    <p className="banner banner--warn" data-testid="stale-data-banner">
      <strong>Data may be out of date.</strong> Last updated{" "}
      <time dateTime={capturedAt}>{formatUtc(capturedAt)}</time>.
    </p>
  );
}
