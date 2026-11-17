import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthCallbackPage } from "../../src/pages/AuthCallbackPage";
import { SignInPage } from "../../src/pages/SignInPage";
import { runAxe } from "./axe";
import { apiError, json, stubFetch } from "./fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
});

function submitEmail(email: string): void {
  fireEvent.change(screen.getByLabelText("Email address"), { target: { value: email } });
  fireEvent.submit(screen.getByRole("button", { name: "Email me a sign-in link" }).closest("form") as HTMLFormElement);
}

describe("a11y: sign-in with Magic_Link", () => {
  it("has no violations in the initial form", async () => {
    const { container } = render(<SignInPage />);
    expect(await runAxe(container)).toHaveNoViolations();
  });

  it("has no violations in the link-sent state", async () => {
    stubFetch({ "POST /api/auth/magic-link": () => json({ ok: true }, 202) });
    const { container } = render(<SignInPage />);
    submitEmail("pilot@example.com");
    await screen.findByText(/a sign-in link is on its way/);
    expect(await runAxe(container)).toHaveNoViolations();
  });

  it("has no violations in the error state", async () => {
    stubFetch({
      "POST /api/auth/magic-link": () => apiError(429, "rate_limited", "Too many requests. Try again later."),
    });
    const { container } = render(<SignInPage />);
    submitEmail("pilot@example.com");
    await screen.findByText("Too many requests. Try again later.");
    expect(await runAxe(container)).toHaveNoViolations();
  });

  it("has no violations on the callback page with an invalid link", async () => {
    window.history.replaceState(null, "", "/auth/callback");
    const { container } = render(<AuthCallbackPage />);
    await screen.findByText("This sign-in link is missing its token. Request a new link.");
    expect(await runAxe(container)).toHaveNoViolations();
  });
});
