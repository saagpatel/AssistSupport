// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useWorkspaceCommandBridge } from "./useWorkspaceCommandBridge";
import {
  WORKSPACE_ANALYZE_INTAKE_EVENT,
  WORKSPACE_COMPARE_LAST_RESOLUTION_EVENT,
  WORKSPACE_COPY_EVIDENCE_EVENT,
  WORKSPACE_COPY_HANDOFF_EVENT,
  WORKSPACE_COPY_KB_DRAFT_EVENT,
  WORKSPACE_REFRESH_SIMILAR_CASES_EVENT,
} from "./workspaceEvents";

describe("useWorkspaceCommandBridge", () => {
  it("wires the workspace command events to the provided callbacks when enabled", () => {
    const onAnalyzeIntake = vi.fn();
    const onCopyHandoffPack = vi.fn();
    const onCopyEvidencePack = vi.fn();
    const onCopyKbDraft = vi.fn();
    const onRefreshSimilarCases = vi.fn();
    const onCompareLastResolution = vi.fn();

    renderHook(() =>
      useWorkspaceCommandBridge({
        enabled: true,
        onAnalyzeIntake,
        onCopyHandoffPack,
        onCopyEvidencePack,
        onCopyKbDraft,
        onRefreshSimilarCases,
        onCompareLastResolution,
      }),
    );

    act(() => {
      window.dispatchEvent(new Event(WORKSPACE_ANALYZE_INTAKE_EVENT));
      window.dispatchEvent(new Event(WORKSPACE_COPY_HANDOFF_EVENT));
      window.dispatchEvent(new Event(WORKSPACE_COPY_EVIDENCE_EVENT));
      window.dispatchEvent(new Event(WORKSPACE_COPY_KB_DRAFT_EVENT));
      window.dispatchEvent(new Event(WORKSPACE_REFRESH_SIMILAR_CASES_EVENT));
      window.dispatchEvent(new Event(WORKSPACE_COMPARE_LAST_RESOLUTION_EVENT));
    });

    expect(onAnalyzeIntake).toHaveBeenCalledTimes(1);
    expect(onCopyHandoffPack).toHaveBeenCalledTimes(1);
    expect(onCopyEvidencePack).toHaveBeenCalledTimes(1);
    expect(onCopyKbDraft).toHaveBeenCalledTimes(1);
    expect(onRefreshSimilarCases).toHaveBeenCalledTimes(1);
    expect(onCompareLastResolution).toHaveBeenCalledTimes(1);
  });

  it("does not wire events when disabled", () => {
    const onAnalyzeIntake = vi.fn();

    renderHook(() =>
      useWorkspaceCommandBridge({
        enabled: false,
        onAnalyzeIntake,
        onCopyHandoffPack: vi.fn(),
        onCopyEvidencePack: vi.fn(),
        onCopyKbDraft: vi.fn(),
        onRefreshSimilarCases: vi.fn(),
        onCompareLastResolution: vi.fn(),
      }),
    );

    act(() => {
      window.dispatchEvent(new Event(WORKSPACE_ANALYZE_INTAKE_EVENT));
    });

    expect(onAnalyzeIntake).not.toHaveBeenCalled();
  });
});
