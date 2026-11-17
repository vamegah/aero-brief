import { useState, type FormEvent } from "react";
import { requestMagicLink } from "../api/auth";
import { ErrorRegion } from "../components/ErrorRegion";
import { errorText } from "../lib/url-params";

export function SignInPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSentTo(null);
    try {
      await requestMagicLink(email);
      setSentTo(email);
    } catch (err) {
      // Keep the entered email so the user can retry.
      setError(errorText(err, "Could not send the sign-in link. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="sign-in-heading">
      <h2 id="sign-in-heading">Sign in</h2>
      <ErrorRegion message={error} />
      <div role="status">
        {sentTo !== null ? (
          <p>
            If {sentTo} can receive email, a sign-in link is on its way. It expires in 15 minutes and works once.
          </p>
        ) : null}
      </div>
      <form onSubmit={(e) => void onSubmit(e)} className="form">
        <label htmlFor="sign-in-email">Email address</label>
        <input
          id="sign-in-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button type="submit" disabled={busy}>
          {busy ? "Sending…" : "Email me a sign-in link"}
        </button>
      </form>
    </section>
  );
}
