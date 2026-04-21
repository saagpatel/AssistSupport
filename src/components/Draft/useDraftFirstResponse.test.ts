// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useDraftFirstResponse } from "./useDraftFirstResponse";

function makeOptions(
  overrides: Partial<Parameters<typeof useDraftFirstResponse>[0]> = {},
) {
  return {
    input: "user cannot log in",
    ocrText: null,
    currentTicket: null,
    modelLoaded: true,
    generateFirstResponse: vi
      .fn()
      .mockResolvedValue({ text: "Sorry for the trouble..." }),
    onShowSuccess: vi.fn(),
    onShowError: vi.fn(),
    ...overrides,
  };
}

describe("useDraftFirstResponse", () => {
  it("blocks generation and errors when no model is loaded", async () => {
    const onShowError = vi.fn();
    const options = makeOptions({ modelLoaded: false, onShowError });
    const { result } = renderHook(() => useDraftFirstResponse(options));

    await act(async () => {
      await result.current.handleGenerateFirstResponse();
    });

    expect(onShowError).toHaveBeenCalledWith(
      expect.stringContaining("No model loaded"),
    );
    expect(options.generateFirstResponse).not.toHaveBeenCalled();
    expect(result.current.firstResponse).toBe("");
  });

  it("stores generated text on successful generation", async () => {
    const generateFirstResponse = vi
      .fn()
      .mockResolvedValue({ text: "Hello — I can help with the login issue." });
    const options = makeOptions({ generateFirstResponse });
    const { result } = renderHook(() => useDraftFirstResponse(options));

    await act(async () => {
      await result.current.handleGenerateFirstResponse();
    });

    expect(generateFirstResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        user_input: "user cannot log in",
        tone: "slack",
      }),
    );
    expect(result.current.firstResponse).toMatch(/login issue/i);
  });

  it("clears first response text on demand", () => {
    const { result } = renderHook(() => useDraftFirstResponse(makeOptions()));

    act(() => {
      result.current.setFirstResponse("a draft");
    });
    expect(result.current.firstResponse).toBe("a draft");

    act(() => {
      result.current.handleClearFirstResponse();
    });
    expect(result.current.firstResponse).toBe("");
  });
});
