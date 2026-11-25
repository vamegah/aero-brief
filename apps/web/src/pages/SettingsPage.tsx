import type { ReactNode } from "react";
import { AccountSection } from "../components/AccountSection";
import { DigestSettings } from "../components/DigestSettings";
import { DisplaySettings } from "../components/DisplaySettings";
import { ErrorRegion } from "../components/ErrorRegion";
import { LoadingState } from "../components/LoadingState";
import { PageHeader } from "../components/PageHeader";
import { SettingsMenu } from "../components/SettingsMenu";
import { WebhookSettings } from "../components/WebhookSettings";
import { useFeatures } from "../features/use-features";
import { useLocationHash } from "../hooks/use-location-hash";
import { useWatchlist } from "../hooks/use-watchlist";
import { resolveSection, visibleSections } from "../lib/settings-sections";

interface SessionGateProps {
  loading: boolean;
  unauthorized: boolean;
  children: ReactNode;
}

/**
 * Wraps the Sections that need a session. While the session check runs, or when it returned 401,
 * the Section is not mounted, so it sends no request.
 */
function SessionGate({ loading, unauthorized, children }: SessionGateProps) {
  if (loading) return <LoadingState text="Loading your settings…" />;
  if (unauthorized) {
    return (
      <div className="settings-lock">
        <svg
          className="settings-lock__icon"
          aria-hidden="true"
          focusable="false"
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="5" y="11" width="14" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
        <div className="settings-lock__body">
          <p className="settings-lock__title">Locked</p>
          <p className="settings-lock__text">Sign in to manage your settings.</p>
          <p>
            <a href="/sign-in">Go to sign in</a>
          </p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

export function SettingsPage() {
  const features = useFeatures();
  const hash = useLocationHash();
  const { watchlist, loading, unauthorized, error, removeAccount } = useWatchlist();
  const sections = visibleSections(features);
  const active = resolveSection(hash, sections);

  function renderSection(id: (typeof sections)[number]): ReactNode {
    switch (id) {
      case "display":
        return <DisplaySettings />;
      case "digest":
        return (
          <SessionGate loading={loading} unauthorized={unauthorized}>
            <DigestSettings watchlistCount={loading ? null : watchlist.length} />
          </SessionGate>
        );
      case "webhooks":
        return (
          <SessionGate loading={loading} unauthorized={unauthorized}>
            <WebhookSettings />
          </SessionGate>
        );
      case "account":
        return (
          <SessionGate loading={loading} unauthorized={unauthorized}>
            <AccountSection removeAccount={removeAccount} onDeleted={() => window.location.assign("/")} />
          </SessionGate>
        );
    }
  }

  return (
    <>
      <PageHeader title="Settings" subtitle="Manage how AeroBrief looks and what it sends you." />
      <ErrorRegion message={unauthorized ? null : error} />
      <div className="settings">
        <SettingsMenu sections={sections} active={active} />
        <div className="settings__panes">
          {sections.map((id) => (
            <div key={id} id={`settings-pane-${id}`} className="settings__pane" hidden={id !== active}>
              {renderSection(id)}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
