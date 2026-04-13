// @vitest-environment jsdom
import { renderHook, act, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSearchApiEmbedding } from "./useSearchApiEmbedding";

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

describe("useSearchApiEmbedding", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  afterEach(() => {
    invokeMock.mockReset();
  });

  it("refreshes and installs the managed model successfully", async () => {
    invokeMock
      .mockResolvedValueOnce({
        installed: false,
        ready: false,
        model_name: "sentence-transformers/all-MiniLM-L6-v2",
        revision: "rev-1",
        local_path: null,
        error: null,
      })
      .mockResolvedValueOnce({
        installed: true,
        ready: true,
        model_name: "sentence-transformers/all-MiniLM-L6-v2",
        revision: "rev-2",
        local_path: "/models/search-api",
        error: null,
      });

    const { result } = renderHook(() => useSearchApiEmbedding());

    await act(async () => {
      await result.current.refreshStatus();
    });
    expect(result.current.status?.installed).toBe(false);
    expect(result.current.error).toBeNull();

    await act(async () => {
      await result.current.installModel();
    });
    expect(result.current.status?.ready).toBe(true);
    expect(result.current.loading).toBe(false);
    expect(invokeMock).toHaveBeenNthCalledWith(
      1,
      "get_search_api_embedding_model_status",
    );
    expect(invokeMock).toHaveBeenNthCalledWith(
      2,
      "install_search_api_embedding_model",
    );
  });

  it("stores errors for failed refresh and install attempts", async () => {
    invokeMock
      .mockRejectedValueOnce(new Error("status unavailable"))
      .mockRejectedValueOnce(new Error("install failed"));

    const { result } = renderHook(() => useSearchApiEmbedding());

    await act(async () => {
      const refreshed = await result.current.refreshStatus();
      expect(refreshed).toBeNull();
    });
    await waitFor(() =>
      expect(result.current.error).toContain("status unavailable"),
    );

    await act(async () => {
      try {
        await result.current.installModel();
      } catch (error) {
        expect(String(error)).toContain("install failed");
      }
    });

    await waitFor(() =>
      expect(result.current.error).toContain("install failed"),
    );
    expect(result.current.loading).toBe(false);
  });
});
