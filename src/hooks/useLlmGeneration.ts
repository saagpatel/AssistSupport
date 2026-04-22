import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type {
  GenerationParams,
  GenerationResult,
  GenerateWithContextParams,
  GenerateWithContextResult,
  FirstResponseParams,
  FirstResponseResult,
  ChecklistGenerateParams,
  ChecklistUpdateParams,
  ChecklistResult,
} from "../types/llm";
import type { ResponseLength } from "../types/workspace";

export interface LlmGenerationState {
  generating: boolean;
  error: string | null;
}

const DEFAULT_STATE: LlmGenerationState = {
  generating: false,
  error: null,
};

/**
 * Hook for non-streaming generation commands. Owns the generating/error state
 * slice. For token-streaming responses use useLlmStreaming — its state slice
 * is kept separate so consumers that only need one surface don't re-render
 * on the other's activity.
 */
export function useLlmGeneration() {
  const [state, setState] = useState<LlmGenerationState>(DEFAULT_STATE);

  const runGenerating = useCallback(
    async <T>(run: () => Promise<T>): Promise<T> => {
      setState((prev) => ({ ...prev, generating: true, error: null }));
      try {
        const result = await run();
        setState((prev) => ({ ...prev, generating: false }));
        return result;
      } catch (e) {
        setState((prev) => ({
          ...prev,
          generating: false,
          error: String(e),
        }));
        throw e;
      }
    },
    [],
  );

  const generate = useCallback(
    (prompt: string, params?: GenerationParams): Promise<GenerationResult> =>
      runGenerating(() =>
        invoke<GenerationResult>("generate_text", { prompt, params }),
      ),
    [runGenerating],
  );

  const generateWithContext = useCallback(
    (
      query: string,
      responseLength: ResponseLength = "Medium",
    ): Promise<GenerateWithContextResult> =>
      runGenerating(() => {
        const params: GenerateWithContextParams = {
          user_input: query,
          response_length: responseLength,
        };
        return invoke<GenerateWithContextResult>("generate_with_context", {
          params,
        });
      }),
    [runGenerating],
  );

  const generateWithContextParams = useCallback(
    (params: GenerateWithContextParams): Promise<GenerateWithContextResult> =>
      runGenerating(() =>
        invoke<GenerateWithContextResult>("generate_with_context", { params }),
      ),
    [runGenerating],
  );

  const generateFirstResponse = useCallback(
    (params: FirstResponseParams): Promise<FirstResponseResult> =>
      runGenerating(() =>
        invoke<FirstResponseResult>("generate_first_response", { params }),
      ),
    [runGenerating],
  );

  const generateChecklist = useCallback(
    (params: ChecklistGenerateParams): Promise<ChecklistResult> =>
      runGenerating(() =>
        invoke<ChecklistResult>("generate_troubleshooting_checklist", {
          params,
        }),
      ),
    [runGenerating],
  );

  const updateChecklist = useCallback(
    (params: ChecklistUpdateParams): Promise<ChecklistResult> =>
      runGenerating(() =>
        invoke<ChecklistResult>("update_troubleshooting_checklist", {
          params,
        }),
      ),
    [runGenerating],
  );

  const testModel = useCallback(
    () =>
      runGenerating(() =>
        invoke<{
          text: string;
          tokens_generated: number;
          duration_ms: number;
        }>("test_model"),
      ),
    [runGenerating],
  );

  return {
    ...state,
    generate,
    generateWithContext,
    generateWithContextParams,
    generateFirstResponse,
    generateChecklist,
    updateChecklist,
    testModel,
  };
}
