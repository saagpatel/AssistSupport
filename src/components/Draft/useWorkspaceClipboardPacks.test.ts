// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../features/workspace/workspaceAssistant", () => ({
  formatHandoffPackForClipboard: (pack: { summary: string }) =>
    `handoff:${pack.summary}`,
  formatEvidencePackForClipboard: (pack: { summary: string }) =>
    `evidence:${pack.summary}`,
  formatKbDraftForClipboard: (pack: { summary: string }) =>
    `kb:${pack.summary}`,
}));

import { useWorkspaceClipboardPacks } from "./useWorkspaceClipboardPacks";

const writeText = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  writeText.mockClear();
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
});

function makeOptions(
  overrides: Partial<Parameters<typeof useWorkspaceClipboardPacks>[0]> = {},
) {
  const handoffPack = {
    summary: "handoff summary",
    nextActions: [],
    operatorNotes: "",
    ticketId: null,
    sources: [],
    confidence: null,
    grounding: [],
  } as unknown as Parameters<
    typeof useWorkspaceClipboardPacks
  >[0]["handoffPack"];

  const evidencePack = {
    summary: "evidence summary",
    sections: [],
  } as unknown as Parameters<
    typeof useWorkspaceClipboardPacks
  >[0]["evidencePack"];

  const kbDraft = {
    summary: "kb summary",
    body: "",
    tags: ["access"],
  } as unknown as Parameters<typeof useWorkspaceClipboardPacks>[0]["kbDraft"];

  const caseIntake = {
    issue: "",
    environment: "",
    impact: "",
    affected_user: "",
    affected_system: "",
    affected_site: "",
    symptoms: "",
    steps_tried: "",
    blockers: "",
    likely_category: "access",
    urgency: "normal",
    note_audience: "internal-note",
  } as unknown as Parameters<
    typeof useWorkspaceClipboardPacks
  >[0]["caseIntake"];

  return {
    handoffPack,
    evidencePack,
    kbDraft,
    caseIntake,
    savedDraftId: null,
    currentTicketId: null,
    saveCaseOutcome: vi.fn().mockResolvedValue(undefined),
    logEvent: vi.fn(),
    onHandoffCopied: vi.fn(),
    onShowSuccess: vi.fn(),
    onShowError: vi.fn(),
    ...overrides,
  };
}

describe("useWorkspaceClipboardPacks", () => {
  it("writes the handoff pack, triggers the copied callback, and shows success", async () => {
    const options = makeOptions();
    const { result } = renderHook(() => useWorkspaceClipboardPacks(options));

    await act(async () => {
      await result.current.handleCopyHandoffPack();
    });

    expect(writeText).toHaveBeenCalled();
    expect(options.onHandoffCopied).toHaveBeenCalledTimes(1);
    expect(options.onShowSuccess).toHaveBeenCalledWith("Handoff pack copied");
  });

  it("skips saveCaseOutcome when there is no savedDraftId", async () => {
    const options = makeOptions();
    const { result } = renderHook(() => useWorkspaceClipboardPacks(options));

    await act(async () => {
      await result.current.handleCopyEvidencePack();
    });

    expect(options.saveCaseOutcome).not.toHaveBeenCalled();
    expect(options.onShowSuccess).toHaveBeenCalledWith("Evidence pack copied");
  });

  it("saves case outcome when a savedDraftId is present for the KB draft copy", async () => {
    const options = makeOptions({ savedDraftId: "draft-9" });
    const { result } = renderHook(() => useWorkspaceClipboardPacks(options));

    await act(async () => {
      await result.current.handleCopyKbDraft();
    });

    expect(options.saveCaseOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        draft_id: "draft-9",
        status: "kb-promoted",
      }),
    );
    expect(options.onShowSuccess).toHaveBeenCalledWith("KB draft copied");
  });

  it("surfaces an error when the clipboard write rejects", async () => {
    writeText.mockRejectedValueOnce(new Error("no clipboard"));
    const options = makeOptions();
    const { result } = renderHook(() => useWorkspaceClipboardPacks(options));

    await act(async () => {
      await result.current.handleCopyHandoffPack();
    });

    expect(options.onShowError).toHaveBeenCalledWith(
      "Failed to copy handoff pack",
    );
    expect(options.onHandoffCopied).not.toHaveBeenCalled();
  });
});
