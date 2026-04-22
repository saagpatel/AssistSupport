import { useLlmModel, type LlmModelState } from "./useLlmModel";
import { useLlmGeneration, type LlmGenerationState } from "./useLlmGeneration";
import { useLlmStreaming, type LlmStreamingState } from "./useLlmStreaming";

/**
 * Combined LLM state surface exposed by the useLlm() orchestrator. Kept for
 * callers that want the full API in one hook; consumers that only touch a
 * single slice should prefer useLlmModel / useLlmGeneration / useLlmStreaming
 * directly so they don't re-render on unrelated state changes.
 */
export interface LlmState
  extends
    LlmModelState,
    Omit<LlmGenerationState, "error">,
    Omit<LlmStreamingState, "error" | "generating"> {
  error: string | null;
}

/**
 * Orchestrator that composes the three focused LLM hooks into the flat API
 * surface the codebase grew up with. When any of the three sub-hooks is
 * generating we expose a unified `generating` flag; likewise `error` folds
 * the first non-null error reported by any slice.
 */
export function useLlm() {
  const model = useLlmModel();
  const generation = useLlmGeneration();
  const streaming = useLlmStreaming();

  return {
    // Model-lifecycle state
    modelInfo: model.modelInfo,
    isLoaded: model.isLoaded,
    loading: model.loading,

    // Streaming state
    streamingText: streaming.streamingText,
    isStreaming: streaming.isStreaming,

    // Unified flags — generation activity OR errors from any slice
    generating: generation.generating || streaming.generating,
    error: model.error ?? generation.error ?? streaming.error,

    // Model-lifecycle commands
    checkModelStatus: model.checkModelStatus,
    getLoadedModel: model.getLoadedModel,
    getModelInfo: model.getModelInfo,
    listModels: model.listModels,
    loadModel: model.loadModel,
    loadCustomModel: model.loadCustomModel,
    validateGgufFile: model.validateGgufFile,
    unloadModel: model.unloadModel,
    getContextWindow: model.getContextWindow,
    setContextWindow: model.setContextWindow,

    // Non-streaming generation commands
    generate: generation.generate,
    generateWithContext: generation.generateWithContext,
    generateWithContextParams: generation.generateWithContextParams,
    generateFirstResponse: generation.generateFirstResponse,
    generateChecklist: generation.generateChecklist,
    updateChecklist: generation.updateChecklist,
    testModel: generation.testModel,

    // Streaming commands
    generateStreaming: streaming.generateStreaming,
    clearStreamingText: streaming.clearStreamingText,
    cancelGeneration: streaming.cancelGeneration,
  };
}
