// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useDraftChecklist } from "./useDraftChecklist";

function makeOptions(
  overrides: Partial<Parameters<typeof useDraftChecklist>[0]> = {},
) {
  return {
    input: "user vpn disconnects",
    ocrText: null,
    diagnosticNotes: "",
    treeResult: null,
    currentTicket: null,
    modelLoaded: true,
    generateChecklist: vi
      .fn()
      .mockResolvedValue({ items: [{ id: "a", label: "Ping gateway" }] }),
    updateChecklist: vi
      .fn()
      .mockResolvedValue({ items: [{ id: "a", label: "Ping gateway" }] }),
    onShowError: vi.fn(),
    ...overrides,
  };
}

describe("useDraftChecklist", () => {
  it("generates a checklist and stores items", async () => {
    const options = makeOptions();
    const { result } = renderHook(() => useDraftChecklist(options));

    await act(async () => {
      await result.current.handleChecklistGenerate();
    });

    expect(options.generateChecklist).toHaveBeenCalledWith(
      expect.objectContaining({ user_input: "user vpn disconnects" }),
    );
    expect(result.current.checklistItems).toHaveLength(1);
    expect(result.current.checklistError).toBeNull();
  });

  it("sets a local error when prompt input is empty", async () => {
    const options = makeOptions({
      input: "",
      ocrText: null,
      currentTicket: null,
    });
    const { result } = renderHook(() => useDraftChecklist(options));

    await act(async () => {
      await result.current.handleChecklistGenerate();
    });

    expect(result.current.checklistError).toMatch(
      /add ticket details or notes/i,
    );
    expect(options.generateChecklist).not.toHaveBeenCalled();
  });

  it("toggles completion state per id", () => {
    const { result } = renderHook(() => useDraftChecklist(makeOptions()));

    act(() => {
      result.current.handleChecklistToggle("a");
    });
    expect(result.current.checklistCompleted).toEqual({ a: true });

    act(() => {
      result.current.handleChecklistToggle("a");
    });
    expect(result.current.checklistCompleted).toEqual({ a: false });
  });
});
