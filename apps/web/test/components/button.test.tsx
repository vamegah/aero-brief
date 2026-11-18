import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "../../src/components/Button";

describe("Button", () => {
  it("is a native button with type=button and secondary variant by default", () => {
    render(<Button>Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });
    expect(button.tagName).toBe("BUTTON");
    expect(button.getAttribute("type")).toBe("button");
    expect(button.className).toContain("btn--secondary");
  });

  it.each(["primary", "secondary", "danger", "ghost"] as const)("applies the %s variant class", (variant) => {
    render(<Button variant={variant}>Go</Button>);
    expect(screen.getByRole("button").className).toContain(`btn--${variant}`);
  });

  it("applies the danger-outline variant class on a native button", () => {
    render(<Button variant="danger-outline">Delete account</Button>);
    const button = screen.getByRole("button", { name: "Delete account" });
    expect(button.tagName).toBe("BUTTON");
    expect(button.className).toContain("btn--danger-outline");
    expect(button.className).not.toContain("btn--danger ");
  });

  it("forwards type, aria props and click handlers, and honors disabled", () => {
    const onClick = vi.fn();
    render(
      <Button type="submit" aria-label="Send it" onClick={onClick}>
        Send
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Send it" });
    expect(button.getAttribute("type")).toBe("submit");
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not fire click when disabled", () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Off
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Off" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});
