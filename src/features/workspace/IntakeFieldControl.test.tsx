// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

  it("renders a multi-line textarea when rows > 1 and reports new values through onChange", async () => {
    const user = userEvent.setup();
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

    await user.click(textarea);
    await user.paste("updated symptoms");
    // paste dispatches a single input event, so the controlled component sees
    // the new value once and reports it via onChange.
    expect(onChange).toHaveBeenCalledWith(
      expect.stringContaining("updated symptoms"),
    );
  });

  it("fires onChange with the latest value on single-line edits", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <IntakeFieldControl label="Affected user" value="" onChange={onChange} />,
    );

    await user.click(screen.getByLabelText("Affected user"));
    await user.paste("alice@example.com");
    expect(onChange).toHaveBeenCalledWith("alice@example.com");
  });
});
