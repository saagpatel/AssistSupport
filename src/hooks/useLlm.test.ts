// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLlm } from "./useLlm";

const invokeMock = vi.fn();
const listenMock = vi.fn();
const unlistenMock = vi.fn();
let tokenListener:
  | ((event: { payload: { token: string; done?: boolean } }) => void)
  | null = null;

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: (...args: unknown[]) => listenMock(...args),
}));

describe("useLlm", () => {
  beforeEach(() => {
    tokenListener = null;
    unlistenMock.mockReset();
    invokeMock.mockReset();
    listenMock.mockReset();
    listenMock.mockImplementation(
      async (_eventName: string, callback: typeof tokenListener) => {
        tokenListener = callback;
        return unlistenMock;
      },
    );
  });

  afterEach(() => {
    tokenListener = null;
  });

  it("covers status, load/unload, generation, and utility commands", async () => {
    invokeMock.mockImplementation(
      (command: string, args?: Record<string, unknown>) => {
        switch (command) {
          case "is_model_loaded":
            return Promise.resolve(true);
          case "get_model_info":
            return Promise.resolve({
              id: "llama-3.1-8b-instruct",
              name: "Llama 3.1 8B Instruct",
            });
          case "list_downloaded_models":
            return Promise.resolve(["llama-3.1-8b-instruct"]);
          case "load_model":
            return Promise.resolve({
              id: args?.modelId,
              name: "Loaded Model",
            });
          case "unload_model":
          case "set_context_window":
          case "cancel_generation":
            return Promise.resolve(undefined);
          case "generate_text":
            return Promise.resolve({
              text: "hello",
              tokens_generated: 1,
              duration_ms: 10,
            });
          case "generate_with_context":
            return Promise.resolve({ text: "context", citations: [] });
          case "generate_first_response":
            return Promise.resolve({ draft: "first" });
          case "generate_troubleshooting_checklist":
            return Promise.resolve({ items: ["step one"] });
          case "update_troubleshooting_checklist":
            return Promise.resolve({ items: ["step two"] });
          case "test_model":
            return Promise.resolve({
              text: "ok",
              tokens_generated: 2,
              duration_ms: 5,
            });
          case "get_context_window":
            return Promise.resolve(4096);
          case "validate_gguf_file":
            return Promise.resolve({
              is_valid: true,
              file_name: "trusted.gguf",
              integrity_status: "verified",
            });
          case "load_custom_model":
            return Promise.resolve({ id: "custom", name: "Custom Model" });
          default:
            return Promise.resolve(undefined);
        }
      },
    );

    const { result } = renderHook(() => useLlm());

    await act(async () => {
      await result.current.checkModelStatus();
    });
    expect(result.current.isLoaded).toBe(true);
    expect(result.current.modelInfo?.id).toBe("llama-3.1-8b-instruct");

    await expect(result.current.getLoadedModel()).resolves.toBe(
      "llama-3.1-8b-instruct",
    );
    await expect(result.current.getModelInfo()).resolves.toEqual({
      id: "llama-3.1-8b-instruct",
      name: "Llama 3.1 8B Instruct",
    });
    await expect(result.current.listModels()).resolves.toEqual([
      "llama-3.1-8b-instruct",
    ]);

    await act(async () => {
      await result.current.loadModel("llama-3.1-8b-instruct", 12);
    });
    expect(invokeMock).toHaveBeenCalledWith("load_model", {
      modelId: "llama-3.1-8b-instruct",
      nGpuLayers: 12,
    });

    await act(async () => {
      await result.current.unloadModel();
    });
    expect(result.current.isLoaded).toBe(false);

    await expect(result.current.generate("prompt")).resolves.toEqual({
      text: "hello",
      tokens_generated: 1,
      duration_ms: 10,
    });
    await expect(
      result.current.generateWithContext("query", "Short"),
    ).resolves.toEqual({
      text: "context",
      citations: [],
    });
    await expect(
      result.current.generateWithContextParams({
        user_input: "query",
        response_length: "Medium",
      }),
    ).resolves.toEqual({
      text: "context",
      citations: [],
    });
    await expect(
      result.current.generateFirstResponse({ prompt: "first" } as never),
    ).resolves.toEqual({ draft: "first" });
    await expect(
      result.current.generateChecklist({ prompt: "check" } as never),
    ).resolves.toEqual({ items: ["step one"] });
    await expect(
      result.current.updateChecklist({ checklist_id: "1" } as never),
    ).resolves.toEqual({ items: ["step two"] });
    await expect(result.current.testModel()).resolves.toEqual({
      text: "ok",
      tokens_generated: 2,
      duration_ms: 5,
    });
    await expect(result.current.getContextWindow()).resolves.toBe(4096);
    await act(async () => {
      await result.current.setContextWindow(8192);
      await result.current.cancelGeneration();
    });
    await expect(
      result.current.validateGgufFile("/tmp/model.gguf"),
    ).resolves.toEqual({
      is_valid: true,
      file_name: "trusted.gguf",
      integrity_status: "verified",
    });
    await expect(
      result.current.loadCustomModel("/tmp/model.gguf", 8),
    ).resolves.toEqual({ id: "custom", name: "Custom Model" });
  });

  it("handles streaming tokens, cleanup, and truncation", async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === "generate_streaming") {
        return Promise.resolve({ text: "final", citations: [] });
      }
      return Promise.resolve(undefined);
    });

    const onToken = vi.fn();
    const { result } = renderHook(() => useLlm());

    const promise = await act(async () => {
      await result.current.generateStreaming("query", "Medium", { onToken });
    });
    expect(listenMock).toHaveBeenCalled();
    act(() => {
      tokenListener?.({ payload: { token: "hello " } });
      tokenListener?.({ payload: { token: "world" } });
      tokenListener?.({ payload: { token: "x".repeat(600_000) } });
      tokenListener?.({ payload: { token: "", done: true } });
    });

    await promise;
    expect(onToken).toHaveBeenCalledWith("hello ");
    expect(result.current.streamingText.startsWith("...[truncated]...")).toBe(
      true,
    );
    expect(result.current.isStreaming).toBe(false);
    expect(unlistenMock).toHaveBeenCalled();

    act(() => {
      result.current.clearStreamingText();
    });
    expect(result.current.streamingText).toBe("");
  });

  it("surfaces failures on command errors", async () => {
    invokeMock.mockRejectedValue(new Error("boom"));

    const { result } = renderHook(() => useLlm());

    await expect(result.current.loadModel("bad-model")).rejects.toThrow("boom");
    await waitFor(() => expect(result.current.error).toContain("boom"));

    await expect(result.current.generate("prompt")).rejects.toThrow("boom");
    expect(result.current.generating).toBe(false);

    await expect(
      result.current.loadCustomModel("/tmp/bad.gguf"),
    ).rejects.toThrow("boom");
    expect(result.current.loading).toBe(false);
  });

  it("covers null-return and fallback branches", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    invokeMock.mockImplementation((command: string) => {
      switch (command) {
        case "is_model_loaded":
          return Promise.resolve(false);
        case "cancel_generation":
        case "get_context_window":
        case "set_context_window":
        case "validate_gguf_file":
          return Promise.reject(new Error(`${command} failed`));
        case "get_model_info":
        case "list_downloaded_models":
          return Promise.reject(new Error(`${command} failed`));
        case "generate_with_context":
        case "generate_first_response":
        case "generate_troubleshooting_checklist":
        case "update_troubleshooting_checklist":
        case "test_model":
        case "generate_streaming":
        case "unload_model":
          return Promise.reject(new Error(`${command} failed`));
        default:
          return Promise.resolve(undefined);
      }
    });

    const { result } = renderHook(() => useLlm());

    await act(async () => {
      await result.current.checkModelStatus();
    });
    expect(result.current.isLoaded).toBe(false);
    await expect(result.current.getLoadedModel()).resolves.toBeNull();
    await expect(result.current.getModelInfo()).resolves.toBeNull();
    await expect(result.current.listModels()).resolves.toEqual([]);

    await expect(result.current.unloadModel()).rejects.toThrow(
      "unload_model failed",
    );
    await expect(
      result.current.generateWithContext("query", "Medium"),
    ).rejects.toThrow("generate_with_context failed");
    await expect(
      result.current.generateWithContextParams({
        user_input: "query",
        response_length: "Medium",
      }),
    ).rejects.toThrow("generate_with_context failed");
    await expect(
      result.current.generateFirstResponse({ prompt: "first" } as never),
    ).rejects.toThrow("generate_first_response failed");
    await expect(
      result.current.generateChecklist({ prompt: "check" } as never),
    ).rejects.toThrow("generate_troubleshooting_checklist failed");
    await expect(
      result.current.updateChecklist({ checklist_id: "1" } as never),
    ).rejects.toThrow("update_troubleshooting_checklist failed");
    await expect(result.current.testModel()).rejects.toThrow(
      "test_model failed",
    );
    await expect(
      result.current.generateStreaming("query", "Medium"),
    ).rejects.toThrow("generate_streaming failed");

    await act(async () => {
      await result.current.cancelGeneration();
    });
    expect(consoleErrorSpy).toHaveBeenCalled();

    await expect(result.current.getContextWindow()).resolves.toBeNull();
    await expect(result.current.setContextWindow(1024)).rejects.toThrow(
      "set_context_window failed",
    );
    await expect(
      result.current.validateGgufFile("/tmp/model.gguf"),
    ).rejects.toThrow("validate_gguf_file failed");
  });
});
