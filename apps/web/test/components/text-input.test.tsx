import { fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { TextInput } from "../../src/components/TextInput";

describe("TextInput", () => {
  it("renders a native input, text type by default, and forwards props", () => {
    const onChange = vi.fn();
    render(<TextInput aria-label="Name" required placeholder="you" onChange={onChange} />);
    const input = screen.getByRole("textbox", { name: "Name" }) as HTMLInputElement;
    expect(input.tagName).toBe("INPUT");
    expect(input.type).toBe("text");
    expect(input.required).toBe(true);
    fireEvent.change(input, { target: { value: "abc" } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("accepts other types and forwards its ref", () => {
    const ref = createRef<HTMLInputElement>();
    render(<TextInput ref={ref} type="email" aria-label="Email" />);
    expect(ref.current).toBe(screen.getByRole("textbox", { name: "Email" }));
    expect(ref.current?.type).toBe("email");
  });
});
