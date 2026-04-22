// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useDispatchManager } from "./useDispatchManager";
import type { QueueItem } from "../../inbox/queueModel";
import type { SavedDraft } from "../../../types/workspace";

// Gate the initial dispatch-history fetch off so the hook's useEffect short-
// circuits synchronously. Handler-level tests exercise the real dispatch
// functions through hook args.
vi.mock("../../revamp", () => ({
  resolveRevampFlags: () => ({
    ASSISTSUPPORT_BATCH_TRIAGE: true,
    ASSISTSUPPORT_COLLABORATION_DISPATCH: false,
  }),
}));

function makeItem(): QueueItem {
  return {
    draft: {
      id: "d1",
      ticket_id: "INC-1",
      input_text: "VPN outage",
      summary_text: "VPN",
    } as unknown as SavedDraft,
    meta: {
      owner: "alice",
      state: "open",
      priority: "normal",
      updatedAt: "2026-04-01T00:00:00Z",
    },
    slaDueAt: "2026-04-02T00:00:00Z",
    isAtRisk: false,
  } as QueueItem;
}

// Stable listDispatchHistory reference shared across tests so the hook's
// useEffect dependency never changes mid-test and can't drive a re-render loop.
const stableListDispatchHistory = vi.fn(async () => []);

describe("useDispatchManager", () => {
  it("errors when previewing without a selected item", () => {
    const showError = vi.fn();
    const { result } = renderHook(() =>
      useDispatchManager({
        operatorName: "alice",
        previewCollaborationDispatch: vi.fn(),
        confirmCollaborationDispatch: vi.fn(),
        cancelCollaborationDispatch: vi.fn(),
        listDispatchHistory: stableListDispatchHistory,
        logEvent: vi.fn(),
        showSuccess: vi.fn(),
        showError,
      }),
    );

    act(() => {
      result.current.handlePreviewDispatch(null);
    });

    expect(showError).toHaveBeenCalledWith(
      "Select a work item before previewing a dispatch",
    );
  });

  it("invokes previewCollaborationDispatch with the current item and dispatch target", async () => {
    const previewCall = vi.fn(async () => ({
      id: "dispatch-1",
      integration_type: "jira",
      destination_label: "Jira",
      title: "Preview title",
      status: "preview",
      created_at: "2026-04-01T00:00:00Z",
    }));

    const { result } = renderHook(() =>
      useDispatchManager({
        operatorName: "alice",
        previewCollaborationDispatch: previewCall as never,
        confirmCollaborationDispatch: vi.fn(),
        cancelCollaborationDispatch: vi.fn(),
        listDispatchHistory: stableListDispatchHistory,
        logEvent: vi.fn(),
        showSuccess: vi.fn(),
        showError: vi.fn(),
      }),
    );

    act(() => {
      result.current.handlePreviewDispatch(makeItem());
    });

    await waitFor(() => {
      expect(previewCall).toHaveBeenCalledWith(
        expect.objectContaining({
          integrationType: "jira",
          draftId: "d1",
        }),
      );
    });
  });

  it("initializes with no dispatch preview or pending id", () => {
    const { result } = renderHook(() =>
      useDispatchManager({
        operatorName: "alice",
        previewCollaborationDispatch: vi.fn(),
        confirmCollaborationDispatch: vi.fn(),
        cancelCollaborationDispatch: vi.fn(),
        listDispatchHistory: stableListDispatchHistory,
        logEvent: vi.fn(),
        showSuccess: vi.fn(),
        showError: vi.fn(),
      }),
    );

    expect(result.current.dispatchTarget).toBe("jira");
    expect(result.current.dispatchPreview).toBeNull();
    expect(result.current.pendingDispatchId).toBeNull();
  });
});
