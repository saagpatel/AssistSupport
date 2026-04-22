// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted mocks for the Tauri command boundary. These must be declared before
// the vi.mock call so the factory captures references to them.
const auditResponseCopyOverrideMock = vi.fn();
const exportDraftMock = vi.fn();

vi.mock("./draftTauriCommands", () => ({
  auditResponseCopyOverride: (
    ...args: Parameters<typeof auditResponseCopyOverrideMock>
  ) => auditResponseCopyOverrideMock(...args),
  exportDraft: (...args: Parameters<typeof exportDraftMock>) =>
    exportDraftMock(...args),
}));

import { useResponsePanelCopy } from "./useResponsePanelCopy";

type HookOptions = Parameters<typeof useResponsePanelCopy>[0];

const writeText = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  writeText.mockClear();
  writeText.mockResolvedValue(undefined);
  auditResponseCopyOverrideMock.mockClear();
  auditResponseCopyOverrideMock.mockResolvedValue(undefined);
  exportDraftMock.mockClear();
  exportDraftMock.mockResolvedValue(true);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

function makeOptions(overrides: Partial<HookOptions> = {}): HookOptions {
  return {
    response: "generated text",
    parsed: { output: "generated text", instructions: "", hasSections: false },
    confidenceMode: "answer",
    sourcesCount: 1,
    onShowSuccess: vi.fn(),
    onShowError: vi.fn(),
    ...overrides,
  };
}

describe("useResponsePanelCopy — handleExport", () => {
  it("calls exportDraft with the current response and format, reports success, and closes the menu", async () => {
    const options = makeOptions();
    const { result } = renderHook(() => useResponsePanelCopy(options));

    act(() => {
      result.current.setShowExportMenu(true);
    });
    expect(result.current.showExportMenu).toBe(true);

    await act(async () => {
      await result.current.handleExport("Markdown");
    });

    expect(exportDraftMock).toHaveBeenCalledWith({
      responseText: "generated text",
      format: "Markdown",
    });
    expect(options.onShowSuccess).toHaveBeenCalledWith(
      "Response exported successfully",
    );
    expect(options.onShowError).not.toHaveBeenCalled();
    expect(result.current.showExportMenu).toBe(false);
  });

  it("short-circuits when there is no response to export", async () => {
    const options = makeOptions({ response: "" });
    const { result } = renderHook(() => useResponsePanelCopy(options));

    await act(async () => {
      await result.current.handleExport("Markdown");
    });

    expect(exportDraftMock).not.toHaveBeenCalled();
    expect(options.onShowSuccess).not.toHaveBeenCalled();
    expect(options.onShowError).not.toHaveBeenCalled();
  });

  it("reports errors via onShowError and still closes the menu on failure", async () => {
    exportDraftMock.mockRejectedValueOnce(new Error("disk full"));
    const options = makeOptions();
    const { result } = renderHook(() => useResponsePanelCopy(options));

    act(() => {
      result.current.setShowExportMenu(true);
    });

    await act(async () => {
      await result.current.handleExport("PlainText");
    });

    expect(options.onShowError).toHaveBeenCalledWith(
      expect.stringContaining("Export failed"),
    );
    expect(options.onShowSuccess).not.toHaveBeenCalled();
    expect(result.current.showExportMenu).toBe(false);
  });

  it("omits the success toast when exportDraft resolves with a falsy saved flag", async () => {
    exportDraftMock.mockResolvedValueOnce(false);
    const options = makeOptions();
    const { result } = renderHook(() => useResponsePanelCopy(options));

    await act(async () => {
      await result.current.handleExport("Html");
    });

    expect(exportDraftMock).toHaveBeenCalledTimes(1);
    expect(options.onShowSuccess).not.toHaveBeenCalled();
    expect(options.onShowError).not.toHaveBeenCalled();
  });
});

describe("useResponsePanelCopy — handleCopy", () => {
  it("copies the raw response to the clipboard when mode is answer and there is at least one citation", async () => {
    const options = makeOptions();
    const { result } = renderHook(() => useResponsePanelCopy(options));

    await act(async () => {
      await result.current.handleCopy();
    });

    expect(writeText).toHaveBeenCalledWith("generated text");
    expect(result.current.copied).toBe(true);
    expect(result.current.showCopyOverride).toBe(false);
    expect(auditResponseCopyOverrideMock).not.toHaveBeenCalled();
  });

  it("prefers parsed.output when the response has ### OUTPUT sections", async () => {
    const options = makeOptions({
      response: "### OUTPUT\nhello\n### IT SUPPORT INSTRUCTIONS\nbye",
      parsed: {
        output: "hello",
        instructions: "bye",
        hasSections: true,
      },
    });
    const { result } = renderHook(() => useResponsePanelCopy(options));

    await act(async () => {
      await result.current.handleCopy();
    });

    expect(writeText).toHaveBeenCalledWith("hello");
  });

  it("resets copied back to false after the 2s timeout", async () => {
    vi.useFakeTimers();
    const options = makeOptions();
    const { result } = renderHook(() => useResponsePanelCopy(options));

    await act(async () => {
      await result.current.handleCopy();
    });
    expect(result.current.copied).toBe(true);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.copied).toBe(false);
  });

  it("opens the copy override modal instead of copying when confidence is not 'answer'", async () => {
    const options = makeOptions({ confidenceMode: "insufficient_evidence" });
    const { result } = renderHook(() => useResponsePanelCopy(options));

    await act(async () => {
      await result.current.handleCopy();
    });

    expect(result.current.showCopyOverride).toBe(true);
    expect(writeText).not.toHaveBeenCalled();
    expect(auditResponseCopyOverrideMock).not.toHaveBeenCalled();
  });

  it("opens the copy override modal when there are no citations, even in 'answer' mode", async () => {
    const options = makeOptions({ sourcesCount: 0 });
    const { result } = renderHook(() => useResponsePanelCopy(options));

    await act(async () => {
      await result.current.handleCopy();
    });

    expect(result.current.showCopyOverride).toBe(true);
    expect(writeText).not.toHaveBeenCalled();
  });

  it("short-circuits when response is empty", async () => {
    const options = makeOptions({ response: "" });
    const { result } = renderHook(() => useResponsePanelCopy(options));

    await act(async () => {
      await result.current.handleCopy();
    });

    expect(writeText).not.toHaveBeenCalled();
    expect(result.current.showCopyOverride).toBe(false);
  });

  it("reports clipboard errors via onShowError without toggling copied", async () => {
    writeText.mockRejectedValueOnce(new Error("clipboard denied"));
    const options = makeOptions();
    const { result } = renderHook(() => useResponsePanelCopy(options));

    await act(async () => {
      await result.current.handleCopy();
    });

    expect(options.onShowError).toHaveBeenCalledWith(
      expect.stringContaining("Copy failed"),
    );
    expect(result.current.copied).toBe(false);
  });

  it("treats an undefined confidenceMode as 'answer' for the gate", async () => {
    const options = makeOptions({ confidenceMode: undefined });
    const { result } = renderHook(() => useResponsePanelCopy(options));

    await act(async () => {
      await result.current.handleCopy();
    });

    // With citations, undefined defaults to 'answer' → direct copy, no override
    expect(writeText).toHaveBeenCalled();
    expect(result.current.showCopyOverride).toBe(false);
  });
});

describe("useResponsePanelCopy — handleConfirmCopyOverride", () => {
  it("audits the override, copies to clipboard, reports success, and closes the modal", async () => {
    const options = makeOptions({
      confidenceMode: "insufficient_evidence",
      sourcesCount: 0,
    });
    const { result } = renderHook(() => useResponsePanelCopy(options));

    act(() => {
      result.current.setShowCopyOverride(true);
      result.current.setCopyOverrideReason("operator needs this now");
    });

    await act(async () => {
      await result.current.handleConfirmCopyOverride();
    });

    expect(auditResponseCopyOverrideMock).toHaveBeenCalledWith({
      reason: "operator needs this now",
      confidenceMode: "insufficient_evidence",
      sourcesCount: 0,
    });
    expect(writeText).toHaveBeenCalledWith("generated text");
    expect(result.current.copied).toBe(true);
    expect(result.current.showCopyOverride).toBe(false);
    expect(result.current.copyOverrideReason).toBe("");
    expect(options.onShowSuccess).toHaveBeenCalledWith(
      "Response copied (override logged)",
    );
  });

  it("passes a null confidenceMode to the audit log when the mode is undefined", async () => {
    const options = makeOptions({
      confidenceMode: undefined,
      sourcesCount: 0,
    });
    const { result } = renderHook(() => useResponsePanelCopy(options));

    act(() => {
      result.current.setCopyOverrideReason("kiosk override");
    });

    await act(async () => {
      await result.current.handleConfirmCopyOverride();
    });

    expect(auditResponseCopyOverrideMock).toHaveBeenCalledWith({
      reason: "kiosk override",
      confidenceMode: null,
      sourcesCount: 0,
    });
  });

  it("rejects an empty reason and never copies or audits", async () => {
    const options = makeOptions({ confidenceMode: "insufficient_evidence" });
    const { result } = renderHook(() => useResponsePanelCopy(options));

    await act(async () => {
      await result.current.handleConfirmCopyOverride();
    });

    expect(options.onShowError).toHaveBeenCalledWith(
      "Reason is required to override copy gating.",
    );
    expect(auditResponseCopyOverrideMock).not.toHaveBeenCalled();
    expect(writeText).not.toHaveBeenCalled();
  });

  it("rejects a whitespace-only reason", async () => {
    const options = makeOptions({ confidenceMode: "insufficient_evidence" });
    const { result } = renderHook(() => useResponsePanelCopy(options));

    act(() => {
      result.current.setCopyOverrideReason("   \n  ");
    });

    await act(async () => {
      await result.current.handleConfirmCopyOverride();
    });

    expect(options.onShowError).toHaveBeenCalledWith(
      "Reason is required to override copy gating.",
    );
    expect(auditResponseCopyOverrideMock).not.toHaveBeenCalled();
  });

  it("reports audit failures and still resets the submitting flag", async () => {
    auditResponseCopyOverrideMock.mockRejectedValueOnce(new Error("audit 500"));
    const options = makeOptions({ confidenceMode: "insufficient_evidence" });
    const { result } = renderHook(() => useResponsePanelCopy(options));

    act(() => {
      result.current.setCopyOverrideReason("escalation-only run");
    });

    await act(async () => {
      await result.current.handleConfirmCopyOverride();
    });

    expect(options.onShowError).toHaveBeenCalledWith(
      expect.stringContaining("Copy override failed"),
    );
    expect(writeText).not.toHaveBeenCalled();
    expect(result.current.copyOverrideSubmitting).toBe(false);
  });

  it("short-circuits when the response is empty", async () => {
    const options = makeOptions({ response: "" });
    const { result } = renderHook(() => useResponsePanelCopy(options));

    act(() => {
      result.current.setCopyOverrideReason("anything");
    });

    await act(async () => {
      await result.current.handleConfirmCopyOverride();
    });

    expect(auditResponseCopyOverrideMock).not.toHaveBeenCalled();
    expect(writeText).not.toHaveBeenCalled();
  });

  it("uses parsed.output for clipboard content when hasSections is true", async () => {
    const options = makeOptions({
      response:
        "### OUTPUT\nvisible reply\n### IT SUPPORT INSTRUCTIONS\ninternal",
      parsed: {
        output: "visible reply",
        instructions: "internal",
        hasSections: true,
      },
      confidenceMode: "insufficient_evidence",
      sourcesCount: 0,
    });
    const { result } = renderHook(() => useResponsePanelCopy(options));

    act(() => {
      result.current.setCopyOverrideReason("ticket requires it");
    });

    await act(async () => {
      await result.current.handleConfirmCopyOverride();
    });

    expect(writeText).toHaveBeenCalledWith("visible reply");
  });
});

describe("useResponsePanelCopy — cancelCopyOverride", () => {
  it("closes the modal and clears the reason together", () => {
    const options = makeOptions({ confidenceMode: "insufficient_evidence" });
    const { result } = renderHook(() => useResponsePanelCopy(options));

    act(() => {
      result.current.setShowCopyOverride(true);
      result.current.setCopyOverrideReason("half-typed reason");
    });
    expect(result.current.showCopyOverride).toBe(true);
    expect(result.current.copyOverrideReason).toBe("half-typed reason");

    act(() => {
      result.current.cancelCopyOverride();
    });

    expect(result.current.showCopyOverride).toBe(false);
    expect(result.current.copyOverrideReason).toBe("");
  });
});

describe("useResponsePanelCopy — export menu click-outside", () => {
  it("closes the export menu when a mousedown fires outside the ref container", async () => {
    const options = makeOptions();
    const { result } = renderHook(() => useResponsePanelCopy(options));

    const inside = document.createElement("div");
    const outside = document.createElement("div");
    document.body.append(inside, outside);

    // Attach the hook's ref to the inside element after render, the way a
    // consumer component would via <div ref={exportMenuRef}>.
    (
      result.current
        .exportMenuRef as React.MutableRefObject<HTMLDivElement | null>
    ).current = inside;

    act(() => {
      result.current.setShowExportMenu(true);
    });

    // Outside click closes
    outside.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    await waitFor(() => expect(result.current.showExportMenu).toBe(false));

    inside.remove();
    outside.remove();
  });

  it("leaves the menu open when the mousedown originates inside the ref container", async () => {
    const options = makeOptions();
    const { result } = renderHook(() => useResponsePanelCopy(options));

    const inside = document.createElement("div");
    const child = document.createElement("button");
    inside.appendChild(child);
    document.body.append(inside);

    (
      result.current
        .exportMenuRef as React.MutableRefObject<HTMLDivElement | null>
    ).current = inside;

    act(() => {
      result.current.setShowExportMenu(true);
    });

    child.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

    // Give React a tick to flush any (non-)state update
    await Promise.resolve();
    expect(result.current.showExportMenu).toBe(true);

    inside.remove();
  });

  it("does not register the outside listener while the menu is closed", () => {
    const addSpy = vi.spyOn(document, "addEventListener");
    const options = makeOptions();
    renderHook(() => useResponsePanelCopy(options));

    // No mousedown listener should have been registered since showExportMenu is false
    const mousedownCalls = addSpy.mock.calls.filter(
      (call) => call[0] === "mousedown",
    );
    expect(mousedownCalls).toHaveLength(0);

    addSpy.mockRestore();
  });
});
