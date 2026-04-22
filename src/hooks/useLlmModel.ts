import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ModelInfo, GgufFileInfo } from "../types/llm";

export interface LlmModelState {
  modelInfo: ModelInfo | null;
  isLoaded: boolean;
  loading: boolean;
  error: string | null;
}

const DEFAULT_STATE: LlmModelState = {
  modelInfo: null,
  isLoaded: false,
  loading: false,
  error: null,
};

/**
 * Hook for model lifecycle and configuration commands.
 *
 * Owns the slice of LlmState that tracks which model is loaded and whether a
 * load is in progress. Does NOT track generation activity — pair with
 * useLlmGeneration or useLlmStreaming for the active-generation flags.
 */
export function useLlmModel() {
  const [state, setState] = useState<LlmModelState>(DEFAULT_STATE);

  const checkModelStatus = useCallback(async () => {
    try {
      const isLoaded = await invoke<boolean>("is_model_loaded");
      if (isLoaded) {
        const info = await invoke<ModelInfo | null>("get_model_info");
        setState((prev) => ({
          ...prev,
          isLoaded: true,
          modelInfo: info,
          error: null,
        }));
      } else {
        setState((prev) => ({
          ...prev,
          isLoaded: false,
          modelInfo: null,
        }));
      }
    } catch (e) {
      setState((prev) => ({ ...prev, error: String(e) }));
    }
  }, []);

  const getLoadedModel = useCallback(async (): Promise<string | null> => {
    try {
      const isLoaded = await invoke<boolean>("is_model_loaded");
      if (isLoaded) {
        const info = await invoke<ModelInfo | null>("get_model_info");
        return info?.id ?? info?.name ?? null;
      }
      return null;
    } catch {
      return null;
    }
  }, []);

  const getModelInfo = useCallback(async (): Promise<ModelInfo | null> => {
    try {
      return await invoke<ModelInfo | null>("get_model_info");
    } catch {
      return null;
    }
  }, []);

  const listModels = useCallback(async (): Promise<string[]> => {
    try {
      return await invoke<string[]>("list_downloaded_models");
    } catch {
      return [];
    }
  }, []);

  const loadModel = useCallback(
    async (modelId: string, nGpuLayers?: number) => {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const info = await invoke<ModelInfo>("load_model", {
          modelId,
          nGpuLayers: nGpuLayers ?? 1000,
        });
        setState((prev) => ({
          ...prev,
          loading: false,
          isLoaded: true,
          modelInfo: info,
        }));
        return info;
      } catch (e) {
        setState((prev) => ({ ...prev, loading: false, error: String(e) }));
        throw e;
      }
    },
    [],
  );

  const unloadModel = useCallback(async () => {
    try {
      await invoke("unload_model");
      setState((prev) => ({ ...prev, isLoaded: false, modelInfo: null }));
    } catch (e) {
      setState((prev) => ({ ...prev, error: String(e) }));
      throw e;
    }
  }, []);

  const validateGgufFile = useCallback(
    async (modelPath: string): Promise<GgufFileInfo> => {
      return await invoke<GgufFileInfo>("validate_gguf_file", { modelPath });
    },
    [],
  );

  const loadCustomModel = useCallback(
    async (modelPath: string, nGpuLayers?: number): Promise<ModelInfo> => {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const validation = await validateGgufFile(modelPath);
        if (!validation.is_valid) {
          throw new Error(`Invalid GGUF file: ${validation.file_name}`);
        }
        const info = await invoke<ModelInfo>("load_custom_model", {
          modelPath,
          nGpuLayers: nGpuLayers ?? 1000,
        });
        setState((prev) => ({
          ...prev,
          loading: false,
          isLoaded: true,
          modelInfo: info,
        }));
        return info;
      } catch (e) {
        setState((prev) => ({ ...prev, loading: false, error: String(e) }));
        throw e;
      }
    },
    [validateGgufFile],
  );

  const getContextWindow = useCallback(async (): Promise<number | null> => {
    try {
      return await invoke<number | null>("get_context_window");
    } catch {
      return null;
    }
  }, []);

  const setContextWindow = useCallback(async (size: number | null) => {
    try {
      await invoke("set_context_window", { size });
    } catch (e) {
      console.error("Failed to set context window:", e);
      throw e;
    }
  }, []);

  return {
    ...state,
    checkModelStatus,
    getLoadedModel,
    getModelInfo,
    listModels,
    loadModel,
    unloadModel,
    loadCustomModel,
    validateGgufFile,
    getContextWindow,
    setContextWindow,
  };
}
