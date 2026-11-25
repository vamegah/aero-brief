import { TimeText } from "./TimeText";

export interface StaleDataBannerProps {
  capturedAt: string;
}

export function StaleDataBanner({ capturedAt }: StaleDataBannerProps) {
  return (
    <p className="banner banner--warn" data-testid="stale-data-banner">
      <strong>Data may be out of date.</strong> Last updated{" "}
      <TimeText iso={capturedAt} />.
    </p>
  );
}
