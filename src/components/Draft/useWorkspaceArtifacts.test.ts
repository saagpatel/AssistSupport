// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../features/workspace/workspaceAssistant", () => ({
  buildSimilarCases: vi.fn().mockReturnValue([
    {
      draft_id: "similar-1",
      ticket_id: "T-1",
      response_text: "resolution",
      summary_text: "summary",
      updated_at: "",
      score: 0.9,
    },
  ]),
  buildResolutionKitFromWorkspace: vi.fn().mockReturnValue({
    name: "kit-from-workspace",
    category: "access",
    response_template: "template",
    checklist_items: [],
    kb_document_ids: [],
    scenario: "access-request",
    intake_snapshot: null,
    created_at: "",
    updated_at: "",
  }),
  applyResolutionKit: vi.fn().mockReturnValue({
    responseText: "kit response",
    intake: { issue: "kit issue" },
    checklistText: "kit checklist",
  }),
  compactLines: (lines: string[]) => lines.filter(Boolean).join("\n"),
}));

import { useWorkspaceArtifacts } from "./useWorkspaceArtifacts";

type HookOptions = Parameters<typeof useWorkspaceArtifacts>[0];

function makeOptions(overrides: Partial<HookOptions> = {}): HookOptions {
  return {
    similarCasesEnabled: true,
    input: "user can't log in",
    response: "try resetting password",
    currentTicket: null,
    currentTicketId: "T-99",
    caseIntake: {
      issue: "login",
      symptoms: "credentials rejected",
    } as HookOptions["caseIntake"],
    kbDraft: { summary: "kb" } as HookOptions["kbDraft"],
    sources: [],
    savedDraftId: null,
    workspaceFavorites: [],

    searchDrafts: vi.fn().mockResolvedValue([]),
    saveResolutionKit: vi.fn().mockResolvedValue("kit-1"),
    saveWorkspaceFavorite: vi.fn().mockResolvedValue("fav-1"),
    deleteWorkspaceFavorite: vi.fn().mockResolvedValue(undefined),
    refreshWorkspaceCatalog: vi.fn().mockResolvedValue(undefined),
    logEvent: vi.fn(),

    setResponse: vi.fn(),
    setOriginalResponse: vi.fn(),
    setIsResponseEdited: vi.fn(),
    setCaseIntake: vi.fn(),
    setDiagnosticNotes: vi.fn(),
    setPanelDensityMode: vi.fn(),

    onShowSuccess: vi.fn(),
    onShowError: vi.fn(),
    ...overrides,
  };
}

describe("useWorkspaceArtifacts", () => {
  it("auto-refreshes similar cases after the debounce fires", async () => {
    const options = makeOptions();
    renderHook(() => useWorkspaceArtifacts(options));

    await waitFor(
      () => {
        expect(options.searchDrafts).toHaveBeenCalled();
      },
      { timeout: 1000 },
    );
  });

  it("skips similar-case search when the feature is disabled", async () => {
    const options = makeOptions({ similarCasesEnabled: false });
    const { result } = renderHook(() => useWorkspaceArtifacts(options));

    await act(async () => {
      await result.current.handleRefreshSimilarCases();
    });

    expect(options.searchDrafts).not.toHaveBeenCalled();
    expect(result.current.similarCases).toEqual([]);
  });

  it("blocks comparing last resolution when response is empty", () => {
    const options = makeOptions({ response: "   " });
    const { result } = renderHook(() => useWorkspaceArtifacts(options));

    act(() => {
      result.current.handleCompareLastResolution();
    });

    expect(options.onShowError).toHaveBeenCalledWith(
      expect.stringContaining("before comparing"),
    );
    expect(result.current.compareCase).toBeNull();
  });

  it("saves a resolution kit and logs the event", async () => {
    const options = makeOptions();
    const { result } = renderHook(() => useWorkspaceArtifacts(options));

    await act(async () => {
      await result.current.handleSaveCurrentResolutionKit();
    });

    expect(options.saveResolutionKit).toHaveBeenCalledWith(
      expect.objectContaining({ category: "access" }),
    );
    expect(options.refreshWorkspaceCatalog).toHaveBeenCalled();
    expect(options.onShowSuccess).toHaveBeenCalledWith(
      expect.stringContaining("resolution kit"),
    );
  });

  it("applies a resolution kit and focuses intake", () => {
    const options = makeOptions();
    const { result } = renderHook(() => useWorkspaceArtifacts(options));

    act(() => {
      result.current.handleApplyResolutionKit({
        id: "kit-9",
        name: "Access Runbook",
        category: "access",
      } as Parameters<typeof result.current.handleApplyResolutionKit>[0]);
    });

    expect(options.setResponse).toHaveBeenCalledWith("kit response");
    expect(options.setPanelDensityMode).toHaveBeenCalledWith("focus-intake");
    expect(options.onShowSuccess).toHaveBeenCalledWith(
      "Applied Access Runbook",
    );
  });

  it("adds a workspace favorite when not already present", async () => {
    const options = makeOptions({ workspaceFavorites: [] });
    const { result } = renderHook(() => useWorkspaceArtifacts(options));

    await act(async () => {
      await result.current.handleToggleWorkspaceFavorite(
        "runbook",
        "r-1",
        "Incident Runbook",
      );
    });

    expect(options.saveWorkspaceFavorite).toHaveBeenCalledWith(
      expect.objectContaining({
        resource_id: "r-1",
        label: "Incident Runbook",
      }),
    );
    expect(options.deleteWorkspaceFavorite).not.toHaveBeenCalled();
    expect(options.onShowSuccess).toHaveBeenCalledWith(
      "Added Incident Runbook to favorites",
    );
  });

  it("removes an existing workspace favorite", async () => {
    const existingFavorite = {
      id: "fav-1",
      kind: "runbook",
      resource_id: "r-1",
      label: "Incident Runbook",
      metadata: null,
    } as HookOptions["workspaceFavorites"][number];

    const options = makeOptions({ workspaceFavorites: [existingFavorite] });
    const { result } = renderHook(() => useWorkspaceArtifacts(options));

    await act(async () => {
      await result.current.handleToggleWorkspaceFavorite(
        "runbook",
        "r-1",
        "Incident Runbook",
      );
    });

    expect(options.deleteWorkspaceFavorite).toHaveBeenCalledWith("fav-1");
    expect(options.saveWorkspaceFavorite).not.toHaveBeenCalled();
    expect(options.onShowSuccess).toHaveBeenCalledWith(
      "Removed Incident Runbook from favorites",
    );
  });
});
