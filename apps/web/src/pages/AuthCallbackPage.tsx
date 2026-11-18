import { useEffect, useRef, useState } from "react";
import { redeemMagicLink } from "../api/auth";
import { ErrorRegion } from "../components/ErrorRegion";
import { LoadingState } from "../components/LoadingState";
import { PageHeader } from "../components/PageHeader";
import { SIGNIN_PARAM, SIGNIN_SUCCESS, storeSigninEmail } from "../lib/signin-flash";
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
      .then((email) => {
        clearFragment();
        storeSigninEmail(email);
        window.location.assign(`/watchlist?${SIGNIN_PARAM}=${SIGNIN_SUCCESS}`);
      })
      .catch((err: unknown) => {
        clearFragment();
        setError(errorText(err, "Could not sign you in. Request a new link."));
      });
  }, []);

  return (
    <section aria-labelledby="callback-heading">
      <PageHeader titleId="callback-heading" title="Signing in" />
      <ErrorRegion message={error} />
      {error === null ? (
        <LoadingState text="Signing you in…" />
      ) : (
        <p>
          <a href="/sign-in">Request a new sign-in link</a>
        </p>
      )}
    </section>
  );
}
