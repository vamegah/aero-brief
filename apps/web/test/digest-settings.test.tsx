import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import { DigestSettings } from "../src/components/DigestSettings";
import { ALL_FLAGS_OFF } from "../src/features/features-schema";
import { FeaturesContext } from "../src/features/use-features";
import { apiError, json, NORMAL } from "./a11y/fixtures";

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

describe("Daily digest section on the Settings page", () => {
  function openWatchlist(digests: boolean) {
    window.history.pushState({}, "", "/settings#digest");
    handlers["GET /api/status/national"] = () => json(NORMAL);
    handlers["GET /api/watchlist"] = () => json({ watchlist: ["JFK"] });
    handlers["GET /api/digest"] = () => json({ enabled: false, hour: 7 });
    return render(
      <FeaturesContext.Provider value={{ ...ALL_FLAGS_OFF, digests }}>
        <App />
      </FeaturesContext.Provider>,
    );
  }

  it("is absent and makes no request while the flag is off", async () => {
    openWatchlist(false);
    await screen.findByRole("region", { name: "Account", hidden: true });
    expect(screen.queryByRole("heading", { name: "Daily digest", hidden: true })).toBeNull();
    expect(calls).not.toContain("GET /api/digest");
  });

  it("sits before the Account section while the flag is on", async () => {
    openWatchlist(true);
    const section = await screen.findByRole("region", { name: "Daily digest" });
    const account = screen.getByRole("region", { name: "Account", hidden: true });
    expect(section.compareDocumentPosition(account) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("DigestSettings", () => {
  it("shows loading text, then preselects 07:00 for the default settings", async () => {
    handlers["GET /api/digest"] = () => json({ enabled: false, hour: 7 });
    render(<DigestSettings watchlistCount={2} />);
    expect(screen.getByText("Loading your digest settings…")).toBeTruthy();
    const select = (await screen.findByLabelText("Send at (UTC)")) as HTMLSelectElement;
    expect(select.value).toBe("7");
    expect(select.options).toHaveLength(24);
    expect(select.options[0]?.textContent).toBe("00:00 UTC");
    expect(select.options[23]?.value).toBe("23");
    expect((screen.getByLabelText("Send me a daily digest") as HTMLInputElement).checked).toBe(false);
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("shows stored settings", async () => {
    handlers["GET /api/digest"] = () => json({ enabled: true, hour: 18 });
    render(<DigestSettings watchlistCount={2} />);
    const select = (await screen.findByLabelText("Send at (UTC)")) as HTMLSelectElement;
    expect(select.value).toBe("18");
    expect((screen.getByLabelText("Send me a daily digest") as HTMLInputElement).checked).toBe(true);
  });

  it("saves the exact body, announces the result, and keeps focus on the button", async () => {
    let body: unknown;
    handlers["GET /api/digest"] = () => json({ enabled: false, hour: 7 });
    handlers["PUT /api/digest"] = (init) => {
      body = JSON.parse(String(init?.body));
      return json(body);
    };
    render(<DigestSettings watchlistCount={2} />);
    fireEvent.click(await screen.findByLabelText("Send me a daily digest"));
    fireEvent.change(screen.getByLabelText("Send at (UTC)"), { target: { value: "9" } });
    const button = screen.getByRole("button", { name: "Save digest settings" });
    button.focus();
    fireEvent.click(button);
    await waitFor(() => expect(screen.getByText("Digest settings saved.")).toBeTruthy());
    expect(body).toEqual({ enabled: true, hour: 9 });
    expect(screen.getByText("Digest settings saved.").closest("[aria-live]")).toBeTruthy();
    expect(document.activeElement).toBe(button);
  });

  it("shows a 400 error from the API as visible text", async () => {
    handlers["GET /api/digest"] = () => json({ enabled: false, hour: 7 });
    handlers["PUT /api/digest"] = () => apiError(400, "invalid_request", "The request is not valid.");
    render(<DigestSettings watchlistCount={2} />);
    fireEvent.click(await screen.findByRole("button", { name: "Save digest settings" }));
    expect((await screen.findAllByText("The request is not valid.")).length).toBeGreaterThan(0);
    expect(screen.queryByText("Digest settings saved.")).toBeNull();
  });

  it("shows a network error as visible text", async () => {
    handlers["GET /api/digest"] = () => json({ enabled: false, hour: 7 });
    handlers["PUT /api/digest"] = () => {
      throw new TypeError("network");
    };
    render(<DigestSettings watchlistCount={2} />);
    fireEvent.click(await screen.findByRole("button", { name: "Save digest settings" }));
    expect((await screen.findAllByText(/Could not reach the server/)).length).toBeGreaterThan(0);
  });

  it("shows the load error and retries", async () => {
    handlers["GET /api/digest"] = () => apiError(500, "boom", "Something broke.");
    render(<DigestSettings watchlistCount={2} />);
    expect(await screen.findByText("Something broke.")).toBeTruthy();
    handlers["GET /api/digest"] = () => json({ enabled: true, hour: 3 });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(((await screen.findByLabelText("Send at (UTC)")) as HTMLSelectElement).value).toBe("3");
  });

  it("shows the hint only when the Watchlist is empty", async () => {
    handlers["GET /api/digest"] = () => json({ enabled: false, hour: 7 });
    const { rerender } = render(<DigestSettings watchlistCount={0} />);
    expect(await screen.findByText("Add an airport to receive a digest")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Save digest settings" }) as HTMLButtonElement).disabled).toBe(false);
    rerender(<DigestSettings watchlistCount={1} />);
    expect(screen.queryByText("Add an airport to receive a digest")).toBeNull();
    rerender(<DigestSettings watchlistCount={null} />);
    expect(screen.queryByText("Add an airport to receive a digest")).toBeNull();
  });
});
