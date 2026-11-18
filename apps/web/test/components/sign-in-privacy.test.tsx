import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SignInPage } from "../../src/pages/SignInPage";

/** Validates: Requirements 7.11 */
describe("SignInPage privacy notice", () => {
  it("shows the notice before submission and links it to the email input", () => {
    render(<SignInPage />);
    const notice = screen.getByText(/We store your email only to send sign-in links and the alerts you choose/);
    expect(notice.textContent).toMatch(/delete your account and all its data at any time/);
    expect(notice.id).not.toBe("");
    const input = screen.getByLabelText("Email address");
    expect(input.getAttribute("aria-describedby")).toBe(notice.id);
  });
});
