export interface ErrorRegionProps {
  /** Error text to announce, or null/empty for none. The region itself is always mounted. */
  message: string | null;
}

export function ErrorRegion({ message }: ErrorRegionProps) {
  return (
    <div role="alert" className="error-region">
      {message ? <p className="error-region__text">{message}</p> : null}
    </div>
  );
}
