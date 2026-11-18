import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FormError } from "../../src/components/FormError";

describe("FormError", () => {
  it("renders the message text and adds no role or aria-live", () => {
    const { container } = render(<FormError id="err">Enter a valid email.</FormError>);
    const el = screen.getByText("Enter a valid email.");
    expect(el.id).toBe("err");
    expect(el.getAttribute("role")).toBeNull();
    expect(container.querySelector("[role], [aria-live]")).toBeNull();
  });
});
