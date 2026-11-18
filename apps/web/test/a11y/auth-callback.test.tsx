import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthCallbackPage } from "../../src/pages/AuthCallbackPage";
import { runAxe } from "./axe";
import { apiError, stubFetch } from "./fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("a11y: auth callback page", () => {
  it("has no violations while redeeming the link (loading)", async () => {
    window.history.replaceState(null, "", "/auth/callback#token=abc123");
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
    const { container } = render(<AuthCallbackPage />);
    await screen.findByText("Signing you in…");
    expect(await runAxe(container)).toHaveNoViolations();
  });

  it("has no violations when the server rejects the link", async () => {
    window.history.replaceState(null, "", "/auth/callback#token=abc123");
    stubFetch({ "POST /api/auth/redeem": () => apiError(400, "invalid_token", "This sign-in link has expired.") });
    const { container } = render(<AuthCallbackPage />);
    await screen.findByRole("link", { name: "Request a new sign-in link" });
    expect(await runAxe(container)).toHaveNoViolations();
  });
});
