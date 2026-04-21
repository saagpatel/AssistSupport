// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KbSection } from "./KbSection";

describe("KbSection", () => {
  afterEach(() => cleanup());

  it("renders the empty placeholder and Select Folder button when no folder is set", () => {
    const onSelectKbFolder = vi.fn();
    render(
      <KbSection
        kbFolder={null}
        indexStats={null}
        loading={null}
        onSelectKbFolder={onSelectKbFolder}
        onRebuildIndex={vi.fn()}
      />,
    );

    expect(screen.getByText("No folder selected")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Select Folder" }));
    expect(onSelectKbFolder).toHaveBeenCalledTimes(1);
  });

  it("shows index stats and triggers rebuild when a folder is configured", () => {
    const onRebuildIndex = vi.fn();
    render(
      <KbSection
        kbFolder="/tmp/kb"
        indexStats={{ total_chunks: 42, total_files: 7 }}
        loading={null}
        onSelectKbFolder={vi.fn()}
        onRebuildIndex={onRebuildIndex}
      />,
    );

    expect(screen.getByText("/tmp/kb")).toBeTruthy();
    expect(screen.getByText("7")).toBeTruthy();
    expect(screen.getByText("42")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Rebuild Index" }));
    expect(onRebuildIndex).toHaveBeenCalledTimes(1);
  });
});
