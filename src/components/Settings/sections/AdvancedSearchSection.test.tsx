// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdvancedSearchSection } from "./AdvancedSearchSection";

describe("AdvancedSearchSection", () => {
  afterEach(() => cleanup());

  it("renders the vector toggle reflecting the current enabled state", () => {
    render(
      <AdvancedSearchSection vectorEnabled={true} onVectorToggle={vi.fn()} />,
    );

    const toggle = screen.getByLabelText(
      "Enable vector embeddings",
    ) as HTMLInputElement;
    expect(toggle.checked).toBe(true);
  });

  it("calls onVectorToggle when the checkbox flips", () => {
    const onVectorToggle = vi.fn();
    render(
      <AdvancedSearchSection
        vectorEnabled={false}
        onVectorToggle={onVectorToggle}
      />,
    );

    fireEvent.click(screen.getByLabelText("Enable vector embeddings"));
    expect(onVectorToggle).toHaveBeenCalledTimes(1);
  });
});
