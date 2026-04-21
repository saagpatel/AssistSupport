// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContextWindowSection } from "./ContextWindowSection";

describe("ContextWindowSection", () => {
  afterEach(() => cleanup());

  it("disables the select and shows the note when no model is loaded", () => {
    render(
      <ContextWindowSection
        loadedModel={null}
        contextWindowSize={null}
        onContextWindowChange={vi.fn()}
      />,
    );

    const select = screen.getByLabelText(
      "Context window size",
    ) as HTMLSelectElement;
    expect(select.disabled).toBe(true);
    expect(
      screen.getByText("Load a model to configure context window."),
    ).toBeTruthy();
  });

  it("invokes onContextWindowChange with the new value when a size is selected", () => {
    const onContextWindowChange = vi.fn();
    render(
      <ContextWindowSection
        loadedModel="llama-3.1-8b-instruct"
        contextWindowSize={4096}
        onContextWindowChange={onContextWindowChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("Context window size"), {
      target: { value: "8192" },
    });
    expect(onContextWindowChange).toHaveBeenCalledWith("8192");
  });
});
