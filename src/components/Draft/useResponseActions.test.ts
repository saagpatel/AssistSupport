// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useResponseActions } from "./useResponseActions";

type HookOptions = Parameters<typeof useResponseActions>[0];

const writeText = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  writeText.mockClear();
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
});

function makeOptions(overrides: Partial<HookOptions> = {}): HookOptions {
  return {
    response: "generated text",
    originalResponse: "generated text",
    isResponseEdited: false,
    confidence: { mode: "answer" } as HookOptions["confidence"],
    sources: [
      { chunk_id: "s1", title: "Source 1", snippet: "x", score: 1 },
    ] as unknown as HookOptions["sources"],
    savedDraftId: null,
    streamingText: "",

    cancelGeneration: vi.fn(),
    saveAsTemplate: vi.fn().mockResolvedValue("tpl-1"),
    auditResponseCopyOverride: vi.fn().mockResolvedValue(undefined),
    exportDraft: vi.fn().mockResolvedValue(true),
    logEvent: vi.fn(),

    setResponse: vi.fn(),
    setOriginalResponse: vi.fn(),
    setIsResponseEdited: vi.fn(),
    setGenerating: vi.fn(),
    setHandoffTouched: vi.fn(),

    onShowSuccess: vi.fn(),
    onShowError: vi.fn(),
    ...overrides,
  };
}

describe("useResponseActions", () => {
  it("copies the response directly when mode is answer and citations exist", async () => {
    const options = makeOptions();
    const { result } = renderHook(() => useResponseActions(options));

    await act(async () => {
      await result.current.handleCopyResponse();
    });

    expect(writeText).toHaveBeenCalledWith("generated text");
    expect(options.auditResponseCopyOverride).not.toHaveBeenCalled();
    expect(options.setHandoffTouched).toHaveBeenCalledWith(true);
    expect(options.onShowSuccess).toHaveBeenCalledWith(
      "Response copied to clipboard",
    );
  });

  it("requires a reason when copy guard would otherwise block", async () => {
    const promptSpy = vi
      .spyOn(window, "prompt")
      .mockReturnValue("ops needs this now");
    const options = makeOptions({ sources: [] });
    const { result } = renderHook(() => useResponseActions(options));

    await act(async () => {
      await result.current.handleCopyResponse();
    });

    expect(promptSpy).toHaveBeenCalled();
    expect(options.auditResponseCopyOverride).toHaveBeenCalledWith({
      reason: "ops needs this now",
      confidenceMode: "answer",
      sourcesCount: 0,
    });
    expect(writeText).toHaveBeenCalled();
  });

  it("cancels and returns early when the user declines the override prompt", async () => {
    vi.spyOn(window, "prompt").mockReturnValue("");
    const options = makeOptions({ sources: [] });
    const { result } = renderHook(() => useResponseActions(options));

    await act(async () => {
      await result.current.handleCopyResponse();
    });

    expect(writeText).not.toHaveBeenCalled();
    expect(options.onShowError).toHaveBeenCalledWith(
      "Copy cancelled (reason required).",
    );
  });

  it("exports the response and marks handoff touched", async () => {
    const options = makeOptions();
    const { result } = renderHook(() => useResponseActions(options));

    await act(async () => {
      await result.current.handleExportResponse();
    });

    expect(options.exportDraft).toHaveBeenCalledWith({
      responseText: "generated text",
      format: "Markdown",
    });
    expect(options.setHandoffTouched).toHaveBeenCalledWith(true);
    expect(options.onShowSuccess).toHaveBeenCalledWith(
      "Response exported successfully",
    );
  });

  it("keeps partial streaming text on cancel", async () => {
    const options = makeOptions({ streamingText: "partial..." });
    const { result } = renderHook(() => useResponseActions(options));

    await act(async () => {
      await result.current.handleCancel();
    });

    expect(options.cancelGeneration).toHaveBeenCalled();
    expect(options.setGenerating).toHaveBeenCalledWith(false);
    expect(options.setResponse).toHaveBeenCalledWith("partial...");
    expect(options.setOriginalResponse).toHaveBeenCalledWith("partial...");
    expect(options.setIsResponseEdited).toHaveBeenCalledWith(false);
  });

  it("flags edited when response changes from the original", () => {
    const options = makeOptions({ originalResponse: "orig" });
    const { result } = renderHook(() => useResponseActions(options));

    act(() => {
      result.current.handleResponseChange("new text");
    });

    expect(options.setResponse).toHaveBeenCalledWith("new text");
    expect(options.setIsResponseEdited).toHaveBeenCalledWith(true);
  });

  it("opens the template modal and stores the rating when saveAsTemplate is called", () => {
    const options = makeOptions();
    const { result } = renderHook(() => useResponseActions(options));

    act(() => {
      result.current.handleSaveAsTemplate(4);
    });

    expect(result.current.showTemplateModal).toBe(true);
    expect(result.current.templateModalRating).toBe(4);
  });
});
