import { useState } from "react";
import { logout } from "../api/auth";
import { errorText } from "../lib/url-params";
import { ErrorRegion } from "./ErrorRegion";

/** Signs out via POST /api/auth/logout, then returns to the status page. */
export function SignOutButton() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onClick() {
    setBusy(true);
    setError(null);
    try {
      await logout();
      window.location.assign("/");
    } catch (err) {
      setError(errorText(err, "Could not sign out. Try again."));
      setBusy(false);
    }
  }

  return (
    <>
      <ErrorRegion message={error} />
      <button type="button" onClick={() => void onClick()} disabled={busy}>
        Sign out
      </button>
    </>
  );
}
