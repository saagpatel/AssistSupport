// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useDraftPersistence } from "./useDraftPersistence";

type HookOptions = Parameters<typeof useDraftPersistence>[0];

function makeOptions(overrides: Partial<HookOptions> = {}): HookOptions {
  const baseHandoffPack = { summary: "handoff" } as HookOptions["handoffPack"];
  const baseActiveDraft = {
    updated_at: "2026-01-01T00:00:00.000Z",
  } as HookOptions["activeWorkspaceDraft"];

  return {
    input: "user cannot log in",
    response: "try resetting",
    sources: [],
    currentTicket: null,
    currentTicketId: null,
    savedDraftId: null,
    savedDraftCreatedAt: null,
    loadedModelName: "llama-3.1",
    handoffPack: baseHandoffPack,
    serializedCaseIntake: null,
    isResponseEdited: false,
    originalResponse: "try resetting",
    hasSaveableWorkspaceContent: true,
    activeWorkspaceDraft: baseActiveDraft,
    workspaceRunbookScopeKey: "workspace:abc",
    guidedRunbookSession: null,
    runbookSessionTouched: false,
    runbookSessionSourceScopeKey: null,

    buildDiagnosisJson: vi.fn().mockReturnValue(null),
    saveDraft: vi.fn().mockResolvedValue("new-draft-42"),
    updateDraft: vi.fn().mockResolvedValue("updated-draft-42"),
    reassignRunbookSessionById: vi.fn().mockResolvedValue(undefined),
    reassignRunbookSessionScope: vi.fn().mockResolvedValue(undefined),
    logEvent: vi.fn(),

    setWorkspaceRunbookScopeKey: vi.fn(),
    setRunbookSessionSourceScopeKey: vi.fn(),
    setAutosaveDraftId: vi.fn(),
    setSavedDraftId: vi.fn(),
    setSavedDraftCreatedAt: vi.fn(),

    pendingDraftOpen: null,
    setPendingDraftOpen: vi.fn(),
    applyLoadedDraft: vi.fn(),

    pendingSimilarCaseOpen: null,
    setPendingSimilarCaseOpen: vi.fn(),
    loadSimilarCaseIntoWorkspace: vi.fn().mockResolvedValue(undefined),
    setCompareCase: vi.fn(),

    onShowSuccess: vi.fn(),
    onShowError: vi.fn(),
    ...overrides,
  };
}

describe("useDraftPersistence.handleSaveDraft", () => {
  it("errors and returns null when the workspace is empty", async () => {
    const options = makeOptions({ hasSaveableWorkspaceContent: false });
    const { result } = renderHook(() => useDraftPersistence(options));

    let returned: string | null = "unset";
    await act(async () => {
      returned = await result.current.handleSaveDraft();
    });

    expect(returned).toBeNull();
    expect(options.onShowError).toHaveBeenCalledWith("Cannot save empty draft");
    expect(options.saveDraft).not.toHaveBeenCalled();
    expect(options.updateDraft).not.toHaveBeenCalled();
  });

  it("calls saveDraft for a new draft and updates derived ids/timestamps", async () => {
    const options = makeOptions();
    const { result } = renderHook(() => useDraftPersistence(options));

    let returned: string | null = null;
    await act(async () => {
      returned = await result.current.handleSaveDraft();
    });

    expect(returned).toBe("new-draft-42");
    expect(options.saveDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        input_text: "user cannot log in",
        response_text: "try resetting",
        is_autosave: false,
        status: "draft",
      }),
    );
    expect(options.setSavedDraftId).toHaveBeenCalledWith("new-draft-42");
    expect(options.setAutosaveDraftId).toHaveBeenCalledWith(null);
    expect(options.onShowSuccess).toHaveBeenCalledWith("Draft saved");
  });

  it("calls updateDraft (not saveDraft) when a savedDraftId exists", async () => {
    const options = makeOptions({
      savedDraftId: "existing-1",
      savedDraftCreatedAt: "2025-12-01T00:00:00.000Z",
    });
    const { result } = renderHook(() => useDraftPersistence(options));

    await act(async () => {
      await result.current.handleSaveDraft();
    });

    expect(options.updateDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "existing-1",
        created_at: "2025-12-01T00:00:00.000Z",
      }),
    );
    expect(options.saveDraft).not.toHaveBeenCalled();
  });
});

describe("useDraftPersistence.handleConfirmOpenDraft", () => {
  it("is a no-op when no draft is pending", async () => {
    const options = makeOptions();
    const { result } = renderHook(() => useDraftPersistence(options));

    await act(async () => {
      await result.current.handleConfirmOpenDraft("replace");
    });

    expect(options.applyLoadedDraft).not.toHaveBeenCalled();
    expect(options.saveDraft).not.toHaveBeenCalled();
  });

  it("applies the pending draft in replace mode without calling saveDraft", async () => {
    const pendingDraftOpen = {
      id: "draft-9",
    } as HookOptions["pendingDraftOpen"];
    const options = makeOptions({ pendingDraftOpen });
    const { result } = renderHook(() => useDraftPersistence(options));

    await act(async () => {
      await result.current.handleConfirmOpenDraft("replace");
    });

    expect(options.saveDraft).not.toHaveBeenCalled();
    expect(options.applyLoadedDraft).toHaveBeenCalledWith(pendingDraftOpen);
    expect(options.setPendingDraftOpen).toHaveBeenCalledWith(null);
    expect(options.onShowSuccess).toHaveBeenCalledWith(
      expect.stringContaining("Opened the selected draft"),
    );
  });
});

describe("useDraftPersistence.handleConfirmOpenSimilarCase", () => {
  it("opens compare mode without loading the case", async () => {
    const pendingSimilarCaseOpen = {
      draft_id: "s1",
      ticket_id: "T-1",
    } as HookOptions["pendingSimilarCaseOpen"];
    const options = makeOptions({ pendingSimilarCaseOpen });
    const { result } = renderHook(() => useDraftPersistence(options));

    await act(async () => {
      await result.current.handleConfirmOpenSimilarCase("compare");
    });

    expect(options.setCompareCase).toHaveBeenCalledWith(pendingSimilarCaseOpen);
    expect(options.loadSimilarCaseIntoWorkspace).not.toHaveBeenCalled();
    expect(options.saveDraft).not.toHaveBeenCalled();
  });
});
