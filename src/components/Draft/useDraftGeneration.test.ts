// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useDraftGeneration } from "./useDraftGeneration";

const enrichmentOk = {
  enrichmentApplied: true,
  status: "ok",
  diagnosticNotes: "context",
};

function makeOptions(
  overrides: Partial<Parameters<typeof useDraftGeneration>[0]> = {},
) {
  return {
    input: "user login fails",
    ocrText: null,
    responseLength: "Medium" as const,
    modelLoaded: true,
    treeResult: null,
    diagnosticNotes: "",
    currentTicket: null,
    currentTicketId: null,
    savedDraftId: null,
    response: "",
    generateStreaming: vi.fn().mockResolvedValue({
      text: "Here is a fix",
      sources: [],
      metrics: null,
      confidence: null,
      grounding: [],
      tokens_generated: 10,
      duration_ms: 100,
    }),
    clearStreamingText: vi.fn(),
    enrichDiagnosticNotes: vi.fn().mockResolvedValue(enrichmentOk),
    saveAlternative: vi.fn().mockResolvedValue(undefined),
    loadAlternatives: vi.fn().mockResolvedValue(undefined),
    chooseAlternative: vi.fn().mockResolvedValue(undefined),
    logEvent: vi.fn(),
    setResponse: vi.fn(),
    setOriginalResponse: vi.fn(),
    setIsResponseEdited: vi.fn(),
    setSources: vi.fn(),
    setMetrics: vi.fn(),
    setConfidence: vi.fn(),
    setGrounding: vi.fn(),
    onShowError: vi.fn(),
    ...overrides,
  };
}

describe("useDraftGeneration", () => {
  it("blocks handleGenerate when no model is loaded", async () => {
    const onShowError = vi.fn();
    const options = makeOptions({ modelLoaded: false, onShowError });
    const { result } = renderHook(() => useDraftGeneration(options));

    await act(async () => {
      await result.current.handleGenerate();
    });

    expect(onShowError).toHaveBeenCalledWith(
      expect.stringContaining("No model loaded"),
    );
    expect(options.generateStreaming).not.toHaveBeenCalled();
  });

  it("calls streaming generator and dispatches setters on success", async () => {
    const options = makeOptions();
    const { result } = renderHook(() => useDraftGeneration(options));

    await act(async () => {
      await result.current.handleGenerate();
    });

    expect(options.generateStreaming).toHaveBeenCalledWith(
      "user login fails",
      "Medium",
      expect.objectContaining({ diagnosticNotes: "context" }),
    );
    expect(options.setResponse).toHaveBeenCalledWith("Here is a fix");
    expect(options.setOriginalResponse).toHaveBeenCalledWith("Here is a fix");
    expect(options.setIsResponseEdited).toHaveBeenCalledWith(false);
    expect(result.current.generating).toBe(false);
  });

  it("skips alternative generation when there is no prior response", async () => {
    const options = makeOptions({ response: "" });
    const { result } = renderHook(() => useDraftGeneration(options));

    await act(async () => {
      await result.current.handleGenerateAlternative();
    });

    expect(options.generateStreaming).not.toHaveBeenCalled();
    expect(options.saveAlternative).not.toHaveBeenCalled();
  });

  it("handleUseAlternative rewrites response and resets edited flag", () => {
    const options = makeOptions();
    const { result } = renderHook(() => useDraftGeneration(options));

    act(() => {
      result.current.handleUseAlternative("alt text");
    });

    expect(options.setResponse).toHaveBeenCalledWith("alt text");
    expect(options.setOriginalResponse).toHaveBeenCalledWith("alt text");
    expect(options.setIsResponseEdited).toHaveBeenCalledWith(false);
  });
});
