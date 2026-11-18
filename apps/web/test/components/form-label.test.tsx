import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FormLabel } from "../../src/components/FormLabel";
import { TextInput } from "../../src/components/TextInput";

describe("FormLabel", () => {
  it("is a <label> bound to its control by htmlFor", () => {
    render(
      <>
        <FormLabel htmlFor="email">Email address</FormLabel>
        <TextInput id="email" />
      </>,
    );
    const label = screen.getByText("Email address");
    expect(label.tagName).toBe("LABEL");
    expect(label.getAttribute("for")).toBe("email");
    expect(screen.getByLabelText("Email address").id).toBe("email");
  });
});
