import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmptyState } from "../../src/components/EmptyState";

describe("EmptyState", () => {
  it("shows an icon and the text", () => {
    const { container } = render(<EmptyState text="No events in the last 24 hours." />);
    expect(screen.getByText("No events in the last 24 hours.")).not.toBeNull();
    expect(container.querySelector("span.icon[aria-hidden='true']")).not.toBeNull();
    expect(container.querySelector(".empty-state__action")).toBeNull();
  });

  it("renders the optional action", () => {
    render(<EmptyState text="Nothing here." action={<a href="/x">Go</a>} />);
    expect(screen.getByRole("link", { name: "Go" })).not.toBeNull();
  });
});
