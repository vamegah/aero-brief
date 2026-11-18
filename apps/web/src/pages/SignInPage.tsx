import { useState, type FormEvent } from "react";
import { requestMagicLink } from "../api/auth";
import { Button } from "../components/Button";
import { ErrorRegion } from "../components/ErrorRegion";
import { FormLabel } from "../components/FormLabel";
import { Icon } from "../components/Icon";
import { PageHeader } from "../components/PageHeader";
import { TextInput } from "../components/TextInput";
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
      <PageHeader titleId="sign-in-heading" title="Sign in" subtitle="We email you a one-time link. No password." />
      <ErrorRegion message={error} />
      <div role="status">
        {sentTo !== null ? (
          <>
            <p>
              <Icon name="check" /> <strong>Check your inbox</strong>
            </p>
            <p>
              If {sentTo} can receive email, a sign-in link is on its way. It expires in 15 minutes and works once.
            </p>
          </>
        ) : null}
      </div>
      {sentTo === null ? (
        <form onSubmit={(e) => void onSubmit(e)} className="form">
          <FormLabel htmlFor="sign-in-email">Email address</FormLabel>
          <TextInput
            id="sign-in-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? "Sending…" : "Email me a sign-in link"}
          </Button>
        </form>
      ) : null}
    </section>
  );
}
