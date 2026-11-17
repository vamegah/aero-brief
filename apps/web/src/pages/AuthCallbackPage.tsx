import { useEffect, useRef, useState } from "react";
import { redeemMagicLink } from "../api/auth";
import { ErrorRegion } from "../components/ErrorRegion";
import { errorText, readTokenFromHash } from "../lib/url-params";

const INVALID_LINK_TEXT = "This sign-in link is missing its token. Request a new link.";

function clearFragment(): void {
  history.replaceState(null, "", window.location.pathname + window.location.search);
}

export function AuthCallbackPage() {
  const [error, setError] = useState<string | null>(null);
  // The token is single-use: guard against the effect running twice (React StrictMode).
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const token = readTokenFromHash(window.location.hash);
    if (token === null) {
      setError(INVALID_LINK_TEXT);
      return;
    }
    redeemMagicLink(token)
      .then(() => {
        clearFragment();
        window.location.assign("/watchlist");
      })
      .catch((err: unknown) => {
        clearFragment();
        setError(errorText(err, "Could not sign you in. Request a new link."));
      });
  }, []);

  return (
    <section aria-labelledby="callback-heading">
      <h2 id="callback-heading">Signing in</h2>
      <ErrorRegion message={error} />
      {error === null ? <p>Signing you in…</p> : <a href="/sign-in">Request a new sign-in link</a>}
    </section>
  );
}
