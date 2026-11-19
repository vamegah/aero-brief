import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import { WebhookSettings } from "../src/components/WebhookSettings";
import { ALL_FLAGS_OFF } from "../src/features/features-schema";
import { FeaturesContext } from "../src/features/use-features";
import { apiError, json, NORMAL } from "./a11y/fixtures";

type Item = {
  id: string;
  host: string;
  createdAt: string;
  state: "active" | "disabled";
  lastOutcome: string | null;
  lastOutcomeAt: string | null;
  disabledAt: string | null;
};

const item = (n: number, over: Partial<Item> = {}): Item => ({
  id: `00000000-0000-4000-8000-00000000000${n}`,
  host: `hooks${n}.example.com`,
  createdAt: "2026-01-02T10:00:00.000Z",
  state: "active",
  lastOutcome: null,
  lastOutcomeAt: null,
  disabledAt: null,
  ...over,
});

type Handler = (init: RequestInit | undefined) => Response | Promise<Response>;
let handlers: Record<string, Handler> = {};
let calls: string[] = [];

beforeEach(() => {
  handlers = {};
  calls = [];
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${typeof input === "string" ? input : String(input)}`;
    calls.push(key);
    const handler = handlers[key];
    return Promise.resolve(handler ? handler(init) : apiError(404, "not_found", "Not found."));
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.pushState({}, "", "/");
});

const list = (items: Item[]) => (): Response => json({ webhooks: items });

describe("Webhooks section on the Watchlist page", () => {
  function openWatchlist(webhooks: boolean) {
    window.history.pushState({}, "", "/watchlist");
    handlers["GET /api/status/national"] = () => json(NORMAL);
    handlers["GET /api/watchlist"] = () => json({ watchlist: [] });
    handlers["GET /api/webhooks"] = list([]);
    return render(
      <FeaturesContext.Provider value={{ ...ALL_FLAGS_OFF, webhooks }}>
        <App />
      </FeaturesContext.Provider>,
    );
  }

  it("is absent and makes no request while the flag is off", async () => {
    openWatchlist(false);
    await screen.findByText("Account");
    expect(screen.queryByRole("heading", { name: "Webhooks" })).toBeNull();
    expect(calls).not.toContain("GET /api/webhooks");
  });

  it("sits between the table area and the Account section while the flag is on", async () => {
    openWatchlist(true);
    const section = await screen.findByRole("region", { name: "Webhooks" });
    const account = screen.getByRole("region", { name: "Account" });
    expect(section.compareDocumentPosition(account) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("WebhookSettings states", () => {
  it("shows loading text, then the empty text", async () => {
    handlers["GET /api/webhooks"] = list([]);
    render(<WebhookSettings />);
    expect(screen.getByText("Loading your webhooks…")).toBeTruthy();
    expect(await screen.findByText("You have no webhooks yet.")).toBeTruthy();
    expect(screen.getByLabelText("Webhook URL (https)")).toBeTruthy();
  });

  it("shows the error text and retries", async () => {
    handlers["GET /api/webhooks"] = () => apiError(500, "boom", "Something broke.");
    render(<WebhookSettings />);
    expect(await screen.findByText("Something broke.")).toBeTruthy();
    handlers["GET /api/webhooks"] = list([item(1)]);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("hooks1.example.com")).toBeTruthy();
  });

  it("shows the unavailable text on 503", async () => {
    handlers["GET /api/webhooks"] = () =>
      apiError(503, "webhooks_not_configured", "Webhooks are not configured: WEBHOOK_MASTER_SECRET is missing.");
    render(<WebhookSettings />);
    expect(await screen.findByText("Webhooks are not available right now.")).toBeTruthy();
    expect(screen.queryByText(/WEBHOOK_MASTER_SECRET/)).toBeNull();
  });

  it("lists hosts only and disables the form at 3 webhooks", async () => {
    handlers["GET /api/webhooks"] = list([item(1), item(2), item(3)]);
    const { container } = render(<WebhookSettings />);
    expect(await screen.findByText("hooks3.example.com")).toBeTruthy();
    expect(container.textContent).not.toContain("https://");
    expect((screen.getByLabelText("Webhook URL (https)") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Add webhook" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Up to 3 webhooks. Delete one to add another.")).toBeTruthy();
  });

  it("shows disabled webhooks with the reason, the outcome time and a Re-enable button", async () => {
    const disabled = item(1, {
      state: "disabled",
      lastOutcome: "failed",
      lastOutcomeAt: "2026-01-02T11:30:00.000Z",
      disabledAt: "2026-01-02T11:30:00.000Z",
    });
    handlers["GET /api/webhooks"] = list([disabled]);
    handlers[`POST /api/webhooks/${disabled.id}/reenable`] = (init) => {
      expect((init?.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
      expect(init?.body).toBe("{}");
      return json({ ...disabled, state: "active", disabledAt: null });
    };
    render(<WebhookSettings />);
    expect(await screen.findByText(/Disabled after repeated failures/)).toBeTruthy();
    expect(screen.getByText(/2026-01-02 11:30 UTC/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Re-enable/ }));
    await waitFor(() => expect(screen.queryByText(/Disabled after repeated failures/)).toBeNull());
    expect(screen.queryByRole("button", { name: /Re-enable/ })).toBeNull();
  });
});

describe("WebhookSettings actions", () => {
  it("shows the secret once, with the warning, and clears it on dismiss", async () => {
    const created = item(1);
    handlers["GET /api/webhooks"] = list([]);
    handlers["POST /api/webhooks"] = (init) => {
      expect(JSON.parse(String(init?.body))).toEqual({ url: "https://hooks1.example.com/path" });
      return json({ ...created, secret: "whsec_abc123" }, 201);
    };
    render(<WebhookSettings />);
    await screen.findByText("You have no webhooks yet.");
    fireEvent.change(screen.getByLabelText("Webhook URL (https)"), {
      target: { value: "https://hooks1.example.com/path" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add webhook" }));
    const secret = (await screen.findByDisplayValue("whsec_abc123")) as HTMLInputElement;
    expect(secret.readOnly).toBe(true);
    expect(screen.getByText("This secret cannot be shown again")).toBeTruthy();
    expect(screen.getByText("hooks1.example.com")).toBeTruthy();
    expect((screen.getByLabelText("Webhook URL (https)") as HTMLInputElement).value).toBe("");

    fireEvent.click(screen.getByRole("button", { name: "I have saved the secret" }));
    expect(screen.queryByDisplayValue("whsec_abc123")).toBeNull();
    expect(screen.queryByText("This secret cannot be shown again")).toBeNull();
  });

  it("does not show the secret again after a remount", async () => {
    handlers["GET /api/webhooks"] = list([item(1)]);
    const first = render(<WebhookSettings />);
    await screen.findByText("hooks1.example.com");
    first.unmount();
    render(<WebhookSettings />);
    await screen.findByText("hooks1.example.com");
    expect(screen.queryByText("This secret cannot be shown again")).toBeNull();
  });

  it("copies the secret and reports it in the live region, and guards a missing clipboard", async () => {
    handlers["GET /api/webhooks"] = list([]);
    handlers["POST /api/webhooks"] = () => json({ ...item(1), secret: "whsec_xyz" }, 201);
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const { container } = render(<WebhookSettings />);
    await screen.findByText("You have no webhooks yet.");
    fireEvent.change(screen.getByLabelText("Webhook URL (https)"), { target: { value: "https://hooks1.example.com/x" } });
    fireEvent.click(screen.getByRole("button", { name: "Add webhook" }));
    await screen.findByDisplayValue("whsec_xyz");
    fireEvent.click(screen.getByRole("button", { name: "Copy secret" }));
    const live = container.querySelector("[aria-live='polite']") as HTMLElement;
    await waitFor(() => expect(live.textContent).toBe("Secret copied."));
    expect(writeText).toHaveBeenCalledWith("whsec_xyz");

    vi.stubGlobal("navigator", {});
    fireEvent.click(screen.getByRole("button", { name: "Copy secret" }));
    await waitFor(() => expect(live.textContent).toMatch(/Could not copy/));
  });

  it("shows the API message when adding fails", async () => {
    handlers["GET /api/webhooks"] = list([]);
    handlers["POST /api/webhooks"] = () => apiError(400, "invalid_webhook_url", "The URL must use https.");
    render(<WebhookSettings />);
    await screen.findByText("You have no webhooks yet.");
    fireEvent.change(screen.getByLabelText("Webhook URL (https)"), { target: { value: "http://x" } });
    fireEvent.click(screen.getByRole("button", { name: "Add webhook" }));
    expect((await screen.findAllByText("The URL must use https.")).length).toBeGreaterThan(0);
  });

  it("deletes a webhook and shows the empty text", async () => {
    const w = item(1);
    handlers["GET /api/webhooks"] = list([w]);
    handlers[`DELETE /api/webhooks/${w.id}`] = () => json({ deleted: true });
    render(<WebhookSettings />);
    await screen.findByText("hooks1.example.com");
    fireEvent.click(screen.getByRole("button", { name: "Delete hooks1.example.com" }));
    expect(await screen.findByText("You have no webhooks yet.")).toBeTruthy();
  });

  it("reports the test result in the live region and leaves focus on the button", async () => {
    const w = item(1);
    handlers["GET /api/webhooks"] = list([w]);
    handlers[`POST /api/webhooks/${w.id}/test`] = () => json({ outcome: "delivered", status: 200 });
    const { container } = render(<WebhookSettings />);
    const button = await screen.findByRole("button", { name: "Send test event to hooks1.example.com" });
    button.focus();
    fireEvent.click(button);
    const live = container.querySelector("[aria-live='polite']") as HTMLElement;
    await waitFor(() => expect(live.textContent).toBe("Test event to hooks1.example.com: delivered (HTTP 200)."));
    expect(within(container).getAllByText(/delivered \(HTTP 200\)/).length).toBe(2);
    expect(document.activeElement).toBe(button);
  });

  it("shows a failed test result", async () => {
    const w = item(1);
    handlers["GET /api/webhooks"] = list([w]);
    handlers[`POST /api/webhooks/${w.id}/test`] = () => json({ outcome: "failed", errorKind: "timeout" });
    const { container } = render(<WebhookSettings />);
    fireEvent.click(await screen.findByRole("button", { name: /Send test event/ }));
    const live = container.querySelector("[aria-live='polite']") as HTMLElement;
    await waitFor(() => expect(live.textContent).toBe("Test event to hooks1.example.com: failed (timeout)."));
  });

  it("shows the retry text on a 429", async () => {
    const w = item(1);
    handlers["GET /api/webhooks"] = list([w]);
    handlers[`POST /api/webhooks/${w.id}/test`] = () =>
      apiError(429, "rate_limited", "Wait 42 seconds before sending another test event.");
    const { container } = render(<WebhookSettings />);
    fireEvent.click(await screen.findByRole("button", { name: /Send test event/ }));
    const live = container.querySelector("[aria-live='polite']") as HTMLElement;
    await waitFor(() => expect(live.textContent).toMatch(/Wait 42 seconds/));
    expect(live.textContent).toMatch(/not sent/);
  });

  it("keeps one always-mounted polite live region and makes every button secondary", async () => {
    handlers["GET /api/webhooks"] = list([item(1, { state: "disabled" })]);
    const { container } = render(<WebhookSettings />);
    expect(container.querySelectorAll("[aria-live]")).toHaveLength(1);
    await screen.findByText("hooks1.example.com");
    expect(container.querySelectorAll("[aria-live]")).toHaveLength(1);
    expect(container.querySelector(".btn--primary")).toBeNull();
    expect(container.querySelectorAll(".btn--secondary").length).toBeGreaterThanOrEqual(4);
  });
});
