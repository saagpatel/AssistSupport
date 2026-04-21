// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IntakeFieldControl } from "./IntakeFieldControl";

describe("IntakeFieldControl", () => {
  afterEach(() => cleanup());

  it("renders a single-line text input when no rows prop is provided", () => {
    render(
      <IntakeFieldControl
        label="Issue summary"
        value="VPN outage in west region"
        onChange={vi.fn()}
      />,
    );

    const input = screen.getByLabelText("Issue summary") as HTMLInputElement;
    expect(input.tagName).toBe("INPUT");
    expect(input.type).toBe("text");
    expect(input.value).toBe("VPN outage in west region");
  });

  it("renders a multi-line textarea when rows > 1 and reports new values through onChange", () => {
    const onChange = vi.fn();
    render(
      <IntakeFieldControl
        label="Symptoms"
        value="initial"
        rows={3}
        onChange={onChange}
      />,
    );

    const textarea = screen.getByLabelText("Symptoms") as HTMLTextAreaElement;
    expect(textarea.tagName).toBe("TEXTAREA");
    expect(textarea.rows).toBe(3);

    fireEvent.change(textarea, { target: { value: "updated symptoms" } });
    expect(onChange).toHaveBeenCalledWith("updated symptoms");
  });

  it("fires onChange with the latest value on single-line edits", () => {
    const onChange = vi.fn();
    render(
      <IntakeFieldControl label="Affected user" value="" onChange={onChange} />,
    );

    fireEvent.change(screen.getByLabelText("Affected user"), {
      target: { value: "alice@example.com" },
    });
    expect(onChange).toHaveBeenCalledWith("alice@example.com");
  });
});
