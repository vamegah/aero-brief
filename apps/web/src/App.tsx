import type { ReactNode } from "react";
import { Footer } from "./components/Footer";
import { NavBar } from "./components/NavBar";
import { useFeatures } from "./features/use-features";
import { AirportPage, airportIdFromPath } from "./pages/AirportPage";
import { AuthCallbackPage } from "./pages/AuthCallbackPage";
import { DigestUnsubscribePage } from "./pages/DigestUnsubscribePage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SignInPage } from "./pages/SignInPage";
import { StatusPage } from "./pages/StatusPage";
import { UnsubscribePage } from "./pages/UnsubscribePage";
import { WatchlistPage } from "./pages/WatchlistPage";

/** Picks the page for a pathname. No router library. Tasks 10.4/10.5 replace the placeholders. */
function pageFor(pathname: string, digests: boolean): ReactNode {
  if (pathname.startsWith("/airport/")) {
    const airportId = airportIdFromPath(pathname);
    return airportId === null ? <NotFoundPage /> : <AirportPage airportId={airportId} />;
  }
  switch (pathname) {
    case "/auth/callback":
      return <AuthCallbackPage />;
    case "/digest/unsubscribe":
      return digests ? <DigestUnsubscribePage /> : <NotFoundPage />;
    case "/settings":
      return <SettingsPage />;
    case "/sign-in":
      return <SignInPage />;
    case "/unsubscribe":
      return <UnsubscribePage />;
    case "/watchlist":
      return <WatchlistPage />;
    case "/":
      return <StatusPage />;
    default:
      return <NotFoundPage />;
  }
}

export function App() {
  const pathname = window.location.pathname;
  const { digests } = useFeatures();
  return (
    <>
      <header className="site-header">
        <div className="site-header__inner">
          <h1 className="site-header__brand">AeroBrief</h1>
          <NavBar pathname={pathname} />
        </div>
      </header>
      <main>
        {pageFor(pathname, digests)}
      </main>
      <Footer />
    </>
  );
}
