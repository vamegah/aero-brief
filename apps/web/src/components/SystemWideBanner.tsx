export interface SystemWideBannerProps {
  explanation: string | null;
}

export function SystemWideBanner({ explanation }: SystemWideBannerProps) {
  return (
    <section className="banner banner--danger" data-testid="system-wide-banner">
      <h2 className="banner__heading">System-wide disruption</h2>
      {explanation !== null ? <p>{explanation}</p> : null}
    </section>
  );
}
