import type { ReactNode } from "react";
import { Footer } from "./components/Footer";
import { NavBar } from "./components/NavBar";
import { AuthCallbackPage } from "./pages/AuthCallbackPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { SignInPage } from "./pages/SignInPage";
import { StatusPage } from "./pages/StatusPage";
import { UnsubscribePage } from "./pages/UnsubscribePage";
import { WatchlistPage } from "./pages/WatchlistPage";

/** Picks the page for a pathname. No router library. Tasks 10.4/10.5 replace the placeholders. */
function pageFor(pathname: string): ReactNode {
  switch (pathname) {
    case "/auth/callback":
      return <AuthCallbackPage />;
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
        {pageFor(pathname)}
      </main>
      <Footer />
    </>
  );
}
