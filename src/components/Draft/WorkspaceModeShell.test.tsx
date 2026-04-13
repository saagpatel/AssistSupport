// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WorkspaceModeShell } from "./WorkspaceModeShell";

describe("WorkspaceModeShell", () => {
  it("renders only the conversation surface when conversation mode is active", () => {
    render(
      <WorkspaceModeShell
        isConversation
        revampModeEnabled
        panelDensityMode="balanced"
        diagnosisCollapsed={false}
        workspaceRailEnabled={false}
        viewToggle={<div>toggle</div>}
        readinessBanner={<div>banner</div>}
        conversationThread={<div>thread</div>}
        conversationInput={<div>input</div>}
        workflowStrip={<div>workflow</div>}
        panels={<div>panels</div>}
        dialogs={<div>dialogs</div>}
      />,
    );

    expect(screen.getByText("thread")).toBeTruthy();
    expect(screen.getByText("input")).toBeTruthy();
    expect(screen.queryByText("workflow")).toBeNull();
    expect(screen.queryByText("panels")).toBeNull();
  });

  it("renders workflow, panels, and dialogs in panel mode with the expected shell class names", () => {
    const { container } = render(
      <WorkspaceModeShell
        isConversation={false}
        revampModeEnabled
        panelDensityMode="focus-intake"
        diagnosisCollapsed
        workspaceRailEnabled
        viewToggle={<div>toggle</div>}
        readinessBanner={<div>banner</div>}
        workflowStrip={<div>workflow</div>}
        panels={<div>panels</div>}
        dialogs={<div>dialogs</div>}
      />,
    );

    expect(screen.getByText("workflow")).toBeTruthy();
    expect(screen.getByText("panels")).toBeTruthy();
    expect(screen.getByText("dialogs")).toBeTruthy();
    expect((container.firstChild as HTMLElement).className).toContain(
      "draft-tab",
    );
    expect((container.firstChild as HTMLElement).className).toContain(
      "panel-density-focus-intake",
    );
    expect((container.firstChild as HTMLElement).className).toContain(
      "diagnosis-collapsed",
    );
    expect((container.firstChild as HTMLElement).className).toContain(
      "has-workspace-rail",
    );
  });
});
