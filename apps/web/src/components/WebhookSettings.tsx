import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ApiRequestError } from "../api/client";
import {
  createWebhook,
  deleteWebhook,
  fetchWebhooks,
  reenableWebhook,
  sendTestEvent,
  type TestResult,
  type WebhookItem,
} from "../api/webhooks";
import { Button } from "./Button";
import { EmptyState } from "./EmptyState";
import { FormLabel } from "./FormLabel";
import { LoadingState } from "./LoadingState";
import { TextInput } from "./TextInput";

const MAX_WEBHOOKS = 3;
const UNAVAILABLE = "Webhooks are not available right now.";

type Secret = { id: string; host: string; value: string };

function errorText(err: unknown, fallback: string): string {
  if (err instanceof ApiRequestError) {
    return err.status === 503 ? UNAVAILABLE : err.message;
  }
  return fallback;
}

function formatTime(iso: string | null): string | null {
  if (iso === null) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function outcomeText(item: WebhookItem): string {
  const at = formatTime(item.lastOutcomeAt);
  if (item.lastOutcome === null) return "No deliveries yet.";
  const word = item.lastOutcome === "delivered" || item.lastOutcome === "failed" || item.lastOutcome === "skipped"
    ? item.lastOutcome
    : "recorded";
  return at === null ? `Last delivery: ${word}.` : `Last delivery: ${word} at ${at}.`;
}

function testText(host: string, result: TestResult): string {
  if (result.outcome === "delivered") {
    return `Test event to ${host}: delivered${result.status !== null ? ` (HTTP ${result.status})` : ""}.`;
  }
  const detail = result.status !== null ? `HTTP ${result.status}` : (result.errorKind ?? "no response");
  return `Test event to ${host}: failed (${detail}).`;
}

/**
 * "Webhooks" section of the Watchlist page. The parent mounts it only while the `webhooks` flag
 * is on. Results go to an always-mounted polite live region; no action moves focus.
 */
export function WebhookSettings() {
  const [items, setItems] = useState<WebhookItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState<Secret | null>(null);
  const [message, setMessage] = useState("");
  const [testResults, setTestResults] = useState<Record<string, string>>({});
  const [retry, setRetry] = useState<(() => void) | null>(null);
  const mounted = useRef(true);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoadError(null);
    try {
      const list = await fetchWebhooks(signal);
      setItems(list);
      setUnavailable(false);
    } catch (err) {
      if (signal?.aborted) return;
      if (err instanceof ApiRequestError && err.status === 503) setUnavailable(true);
      else setLoadError(errorText(err, "Could not load your webhooks."));
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    void load(controller.signal);
    return () => {
      mounted.current = false;
      controller.abort();
    };
  }, [load]);

  async function run(action: () => Promise<void>, fallback: string): Promise<void> {
    setBusy(true);
    setRetry(null);
    try {
      await action();
    } catch (err) {
      if (!mounted.current) return;
      const text = errorText(err, fallback);
      setMessage(text);
      setFormError(text);
      setRetry(() => () => void run(action, fallback));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  function onAdd(event: FormEvent): void {
    event.preventDefault();
    const trimmed = url.trim();
    if (trimmed === "") {
      setRetry(null);
      setFormError("Enter a webhook URL that starts with https://.");
      return;
    }
    setFormError(null);
    void run(async () => {
      const created = await createWebhook(trimmed);
      if (!mounted.current) return;
      const { secret: value, ...item } = created;
      setItems((prev) => [...(prev ?? []), item]);
      setSecret({ id: item.id, host: item.host, value });
      setUrl("");
      setMessage(`Webhook added for ${item.host}. Copy the secret now.`);
    }, "Could not add the webhook.");
  }

  function onDelete(item: WebhookItem): void {
    setFormError(null);
    void run(async () => {
      await deleteWebhook(item.id);
      if (!mounted.current) return;
      setItems((prev) => (prev ?? []).filter((w) => w.id !== item.id));
      setSecret((s) => (s?.id === item.id ? null : s));
      setMessage(`Webhook for ${item.host} deleted.`);
    }, "Could not delete the webhook.");
  }

  function onReenable(item: WebhookItem): void {
    setFormError(null);
    void run(async () => {
      const updated = await reenableWebhook(item.id);
      if (!mounted.current) return;
      setItems((prev) => (prev ?? []).map((w) => (w.id === updated.id ? updated : w)));
      setMessage(`Webhook for ${item.host} is active again.`);
    }, "Could not re-enable the webhook.");
  }

  function onTest(item: WebhookItem): void {
    setFormError(null);
    setBusy(true);
    void (async () => {
      let text: string;
      try {
        text = testText(item.host, await sendTestEvent(item.id));
      } catch (err) {
        text =
          err instanceof ApiRequestError && err.status === 429
            ? `Test event to ${item.host} not sent. Only one test event per minute is allowed. ${err.message}`
            : `Test event to ${item.host} not sent. ${errorText(err, "Try again.")}`;
      }
      if (!mounted.current) return;
      setTestResults((prev) => ({ ...prev, [item.id]: text }));
      setMessage(text);
      setBusy(false);
    })();
  }

  async function onCopy(): Promise<void> {
    if (secret === null) return;
    try {
      if (typeof navigator === "undefined" || navigator.clipboard === undefined) throw new Error("no clipboard");
      await navigator.clipboard.writeText(secret.value);
      if (mounted.current) setMessage("Secret copied.");
    } catch {
      if (mounted.current) setMessage("Could not copy. Select the secret text and copy it yourself.");
    }
  }

  const full = items !== null && items.length >= MAX_WEBHOOKS;

  return (
    <section className="webhook-settings" aria-labelledby="webhooks-heading">
      <h3 id="webhooks-heading">Webhooks</h3>
      <p className="webhook-settings__help">
        Up to {MAX_WEBHOOKS} webhooks receive signed alerts when a ground stop starts or ends.
      </p>

      {unavailable ? (
        <p className="webhook-settings__status">{UNAVAILABLE}</p>
      ) : loadError !== null ? (
        <div className="webhook-settings__status">
          <p>{loadError}</p>
          <Button onClick={() => void load()}>Try again</Button>
        </div>
      ) : items === null ? (
        <LoadingState text="Loading your webhooks…" />
      ) : (
        <>
          {items.length === 0 ? <EmptyState text="You have no webhooks yet." /> : null}
          {items.length > 0 ? (
            <ul className="webhook-settings__list">
              {items.map((item) => (
                <li key={item.id} className="webhook-settings__item">
                  <p className="webhook-settings__host">{item.host}</p>
                  {item.state === "disabled" ? (
                    <p className="webhook-settings__disabled">
                      Disabled after repeated failures. {outcomeText(item)}
                    </p>
                  ) : (
                    <p className="webhook-settings__outcome">Active. {outcomeText(item)}</p>
                  )}
                  {testResults[item.id] !== undefined ? (
                    <p className="webhook-settings__result">{testResults[item.id]}</p>
                  ) : null}
                  <div className="webhook-settings__actions">
                    {item.state === "disabled" ? (
                      <Button
                        variant="secondary"
                        aria-label={`Re-enable ${item.host}`}
                        disabled={busy}
                        onClick={() => onReenable(item)}
                      >
                        Re-enable
                      </Button>
                    ) : null}
                    <Button
                      variant="secondary"
                      aria-label={`Send test event to ${item.host}`}
                      disabled={busy}
                      onClick={() => onTest(item)}
                    >
                      Send test event
                    </Button>
                    <Button
                      variant="secondary"
                      aria-label={`Delete ${item.host}`}
                      disabled={busy}
                      onClick={() => onDelete(item)}
                    >
                      Delete
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}

          {secret !== null ? (
            <div className="webhook-settings__secret">
              <FormLabel htmlFor="webhook-secret">{`Signing secret for ${secret.host}`}</FormLabel>
              <TextInput id="webhook-secret" readOnly value={secret.value} aria-describedby="webhook-secret-warning" />
              <p id="webhook-secret-warning" className="webhook-settings__warning">
                This secret cannot be shown again
              </p>
              <div className="webhook-settings__actions">
                <Button variant="secondary" onClick={() => void onCopy()}>
                  Copy secret
                </Button>
                <Button variant="secondary" onClick={() => setSecret(null)}>
                  I have saved the secret
                </Button>
              </div>
            </div>
          ) : null}

          <form className="webhook-settings__form" onSubmit={onAdd} noValidate>
            <FormLabel htmlFor="webhook-url">Webhook URL (https)</FormLabel>
            <TextInput
              id="webhook-url"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              value={url}
              disabled={full}
              onChange={(e) => setUrl(e.target.value)}
              aria-describedby="webhook-url-hint"
            />
            <p id="webhook-url-hint" className="webhook-settings__hint">
              {full ? "Up to 3 webhooks. Delete one to add another." : "Up to 3 webhooks."}
            </p>
            {formError !== null ? <p className="webhook-settings__error">{formError}</p> : null}
            {formError !== null && retry !== null ? (
              <Button variant="secondary" disabled={busy} onClick={retry}>
                Retry
              </Button>
            ) : null}
            <Button type="submit" variant="secondary" disabled={busy || full}>
              Add webhook
            </Button>
          </form>
        </>
      )}

      <div aria-live="polite" className="webhook-settings__live">
        {message}
      </div>
    </section>
  );
}
