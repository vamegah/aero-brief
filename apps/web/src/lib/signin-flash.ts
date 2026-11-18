/**
 * One-time "signed in" message handed from the callback page to the Watchlist page.
 * The email travels in sessionStorage only. The URL carries just the `signin=success` flag.
 */

export const SIGNIN_EMAIL_KEY = "aerobrief.signedInEmail";
export const SIGNIN_PARAM = "signin";
export const SIGNIN_SUCCESS = "success";

export type SigninFlash = {
  /** The signed-in email, or null when storage was unavailable. */
  email: string | null;
};

/** Stores the email for the next page. Storage can throw (private mode, blocked): that is ignored. */
export function storeSigninEmail(email: string): void {
  try {
    window.sessionStorage.setItem(SIGNIN_EMAIL_KEY, email);
  } catch {
    // The Watchlist page then shows the message without an email.
  }
}

function takeStoredEmail(): string | null {
  try {
    const value = window.sessionStorage.getItem(SIGNIN_EMAIL_KEY);
    window.sessionStorage.removeItem(SIGNIN_EMAIL_KEY);
    return value !== null && value !== "" ? value : null;
  } catch {
    return null;
  }
}

/**
 * Returns the flash when the URL has `signin=success`, otherwise null. Always removes the stored
 * email, and strips only the `signin` param from the URL (other params and the hash are kept).
 */
export function consumeSigninFlash(): SigninFlash | null {
  const email = takeStoredEmail();
  const url = new URL(window.location.href);
  if (!url.searchParams.has(SIGNIN_PARAM)) return null;
  const flagged = url.searchParams.get(SIGNIN_PARAM) === SIGNIN_SUCCESS;
  url.searchParams.delete(SIGNIN_PARAM);
  history.replaceState(history.state, "", url.pathname + url.search + url.hash);
  return flagged ? { email } : null;
}
