import type { ReactNode } from "react";
import { DisplaySettings } from "./components/DisplaySettings";
import { Footer } from "./components/Footer";
import { NavBar } from "./components/NavBar";
import { useFeatures } from "./features/use-features";
import { AirportPage, airportIdFromPath } from "./pages/AirportPage";
import { AuthCallbackPage } from "./pages/AuthCallbackPage";
import { DigestUnsubscribePage } from "./pages/DigestUnsubscribePage";
import { NotFoundPage } from "./pages/NotFoundPage";
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
          <span className="site-header__brand">AeroBrief</span>
          <NavBar pathname={pathname} />
        </div>
      </header>
      <main>
        <h1>AeroBrief</h1>
        <p>FAA ground stop status for 20 major US airports.</p>
        {pageFor(pathname, digests)}
      </main>
      <DisplaySettings />
      <Footer />
    </>
  );
}
