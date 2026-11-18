import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LoadingState } from "../../src/components/LoadingState";

describe("LoadingState", () => {
  it("shows an icon and the text, with no aria-live", () => {
    const { container } = render(<LoadingState text="Loading status…" />);
    expect(screen.getByText("Loading status…")).not.toBeNull();
    expect(container.querySelector("span.icon[aria-hidden='true']")).not.toBeNull();
    expect(container.querySelector("[aria-live]")).toBeNull();
  });
});
