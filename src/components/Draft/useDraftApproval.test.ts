// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useDraftApproval } from "./useDraftApproval";

function makeOptions(
  overrides: Partial<Parameters<typeof useDraftApproval>[0]> = {},
) {
  return {
    searchKb: vi.fn().mockResolvedValue([]),
    generateWithContextParams: vi
      .fn()
      .mockResolvedValue({ text: "summary", sources: [] }),
    modelLoaded: true,
    onShowError: vi.fn(),
    ...overrides,
  };
}

describe("useDraftApproval", () => {
  it("sets an error when searching with an empty query", async () => {
    const options = makeOptions();
    const { result } = renderHook(() => useDraftApproval(options));

    await act(async () => {
      await result.current.handleApprovalSearch();
    });

    expect(result.current.approvalError).toMatch(/enter a search term/i);
    expect(options.searchKb).not.toHaveBeenCalled();
  });

  it("stores results from a successful approval search", async () => {
    const searchKb = vi
      .fn()
      .mockResolvedValue([
        { id: "kb-1", title: "Approval Policy", snippet: "..." },
      ]);
    const options = makeOptions({ searchKb });
    const { result } = renderHook(() => useDraftApproval(options));

    act(() => {
      result.current.setApprovalQuery("password reset");
    });

    await act(async () => {
      await result.current.handleApprovalSearch();
    });

    expect(searchKb).toHaveBeenCalledWith("password reset", 5);
    expect(result.current.approvalResults).toHaveLength(1);
    expect(result.current.approvalError).toBeNull();
  });

  it("blocks summarize when no model is loaded and surfaces a toast error", async () => {
    const onShowError = vi.fn();
    const options = makeOptions({ modelLoaded: false, onShowError });
    const { result } = renderHook(() => useDraftApproval(options));

    act(() => {
      result.current.setApprovalQuery("vpn access");
    });

    await act(async () => {
      await result.current.handleApprovalSummarize();
    });

    expect(onShowError).toHaveBeenCalledWith(
      expect.stringContaining("No model loaded"),
    );
    expect(options.generateWithContextParams).not.toHaveBeenCalled();
  });
});
