import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MetricChip } from "../../src/components/MetricChip";

describe("MetricChip", () => {
  it("renders label and value as plain text", () => {
    const { container } = render(<MetricChip label="Ground stops" value={2} />);
    expect(container.textContent).toBe("Ground stops: 2");
  });

  it("accepts a string value", () => {
    const { container } = render(<MetricChip label="Overall" value="Normal" />);
    expect(container.textContent).toBe("Overall: Normal");
  });
});
