import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotFoundPage } from "../../src/pages/NotFoundPage";
import { UnsubscribePage } from "../../src/pages/UnsubscribePage";
import { runAxe } from "./axe";
import { apiError, json, stubFetch } from "./fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.pushState({}, "", "/");
});

const URL_OK = "/unsubscribe?u=user-1&a=JFK&sig=abc";

describe("a11y: not found page", () => {
  it("has no violations", async () => {
    const { container } = render(<NotFoundPage />);
    expect(await runAxe(container)).toHaveNoViolations();
  });
});

describe("a11y: unsubscribe page", () => {
  it("has no violations in the confirm state", async () => {
    window.history.replaceState(null, "", URL_OK);
    const { container } = render(<UnsubscribePage />);
    expect(await runAxe(container)).toHaveNoViolations();
  });

  it("has no violations while loading", async () => {
    window.history.replaceState(null, "", URL_OK);
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
    const { container } = render(<UnsubscribePage />);
    fireEvent.click(screen.getByRole("button", { name: "Confirm unsubscribe" }));
    await screen.findByText("Unsubscribing…");
    expect(await runAxe(container)).toHaveNoViolations();
  });

  it("has no violations in the success state", async () => {
    window.history.replaceState(null, "", URL_OK);
    stubFetch({ "POST /api/unsubscribe": () => json({ airportId: "JFK", airportName: "New York JFK" }) });
    const { container } = render(<UnsubscribePage />);
    fireEvent.click(screen.getByRole("button", { name: "Confirm unsubscribe" }));
    await screen.findByText(/You will no longer get alerts/);
    expect(await runAxe(container)).toHaveNoViolations();
  });

  it("has no violations in the error state", async () => {
    window.history.replaceState(null, "", URL_OK);
    stubFetch({ "POST /api/unsubscribe": () => apiError(403, "invalid_signature", "This unsubscribe link is not valid.") });
    const { container } = render(<UnsubscribePage />);
    fireEvent.click(screen.getByRole("button", { name: "Confirm unsubscribe" }));
    await waitFor(() => expect(screen.getByText("This unsubscribe link is not valid.")).toBeTruthy());
    expect(await runAxe(container)).toHaveNoViolations();
  });
});
