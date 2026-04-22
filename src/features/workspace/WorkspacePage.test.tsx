// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WorkspacePage } from "./WorkspacePage";

vi.mock("./WorkspaceRevampPage", () => ({
  WorkspaceRevampPage: () => (
    <div data-testid="workspace-revamp-page">Workspace revamp</div>
  ),
}));

describe("WorkspacePage", () => {
  it("renders the workspace revamp wrapper", () => {
    render(<WorkspacePage onNavigateToSource={vi.fn()} />);

    expect(screen.getByTestId("workspace-revamp-page").textContent).toBe(
      "Workspace revamp",
    );
  });
});
