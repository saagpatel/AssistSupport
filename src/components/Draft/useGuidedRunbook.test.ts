// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useGuidedRunbook } from "./useGuidedRunbook";

function makeSession(
  overrides: Partial<
    NonNullable<Parameters<typeof useGuidedRunbook>[0]["guidedRunbookSession"]>
  > = {},
) {
  return {
    id: "session-1",
    scenario: "security-incident",
    steps: ["Ack", "Contain", "Notify"],
    current_step: 0,
    status: "active" as const,
    scope_key: "workspace:test",
    started_at: "",
    updated_at: "",
    evidence: [],
    ...overrides,
  } as unknown as NonNullable<
    Parameters<typeof useGuidedRunbook>[0]["guidedRunbookSession"]
  >;
}

function makeOptions(
  overrides: Partial<Parameters<typeof useGuidedRunbook>[0]> = {},
) {
  return {
    runbookTemplates: [
      {
        id: "tpl-1",
        name: "Security",
        scenario: "security-incident",
        steps: ["Ack", "Contain", "Notify"],
      },
    ],
    guidedRunbookSession: null,
    workspaceRunbookScopeKey: "workspace:test",
    currentTicketId: null,
    startRunbookSession: vi.fn().mockResolvedValue(undefined),
    addRunbookStepEvidence: vi.fn().mockResolvedValue(undefined),
    advanceRunbookSession: vi.fn().mockResolvedValue(undefined),
    refreshWorkspaceCatalog: vi.fn().mockResolvedValue(undefined),
    logEvent: vi.fn(),
    setDiagnosticNotes: vi.fn(),
    setPanelDensityMode: vi.fn(),
    setRunbookSessionSourceScopeKey: vi.fn(),
    setRunbookSessionTouched: vi.fn(),
    onShowSuccess: vi.fn(),
    onShowError: vi.fn(),
    ...overrides,
  };
}

describe("useGuidedRunbook", () => {
  it("refuses to start an unknown template", async () => {
    const options = makeOptions();
    const { result } = renderHook(() => useGuidedRunbook(options));

    await act(async () => {
      await result.current.handleStartGuidedRunbook("missing-id");
    });

    expect(options.onShowError).toHaveBeenCalledWith(
      "Choose a guided runbook template first",
    );
    expect(options.startRunbookSession).not.toHaveBeenCalled();
  });

  it("refuses to start a new runbook while an active one is in progress", async () => {
    const options = makeOptions({
      guidedRunbookSession: makeSession({ status: "active" }),
    });
    const { result } = renderHook(() => useGuidedRunbook(options));

    await act(async () => {
      await result.current.handleStartGuidedRunbook("tpl-1");
    });

    expect(options.onShowError).toHaveBeenCalledWith(
      expect.stringContaining("Finish the current guided runbook"),
    );
    expect(options.startRunbookSession).not.toHaveBeenCalled();
  });

  it("starts a session, refreshes catalog, and focuses intake", async () => {
    const options = makeOptions();
    const { result } = renderHook(() => useGuidedRunbook(options));

    await act(async () => {
      await result.current.handleStartGuidedRunbook("tpl-1");
    });

    expect(options.startRunbookSession).toHaveBeenCalledWith(
      "security-incident",
      ["Ack", "Contain", "Notify"],
      "workspace:test",
    );
    expect(options.setPanelDensityMode).toHaveBeenCalledWith("focus-intake");
    expect(options.setRunbookSessionTouched).toHaveBeenCalledWith(true);
    expect(options.onShowSuccess).toHaveBeenCalledWith("Started Security");
  });

  it("handleCopyRunbookProgressToNotes errors when there is no evidence yet", () => {
    const options = makeOptions({
      guidedRunbookSession: makeSession({ evidence: [] }),
    });
    const { result } = renderHook(() => useGuidedRunbook(options));

    act(() => {
      result.current.handleCopyRunbookProgressToNotes();
    });

    expect(options.onShowError).toHaveBeenCalledWith(
      "No guided runbook progress to copy yet",
    );
    expect(options.setDiagnosticNotes).not.toHaveBeenCalled();
  });

  it("note change sets touched only when value has content", () => {
    const options = makeOptions();
    const { result } = renderHook(() => useGuidedRunbook(options));

    act(() => {
      result.current.handleGuidedRunbookNoteChange("   ");
    });
    expect(options.setRunbookSessionTouched).not.toHaveBeenCalled();

    act(() => {
      result.current.handleGuidedRunbookNoteChange("real note");
    });
    expect(options.setRunbookSessionTouched).toHaveBeenCalledWith(true);
    expect(result.current.guidedRunbookNote).toBe("real note");
  });
});
