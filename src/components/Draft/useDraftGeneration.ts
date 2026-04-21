import { useCallback, useRef, useState } from "react";
import type { TreeResult } from "./DiagnosisPanel";
import type { JiraTicket } from "../../hooks/useJira";
import type {
  GenerateWithContextResult,
  JiraTicketContext,
  TreeDecisions,
} from "../../types/llm";
import type { ConfidenceAssessment, GroundedClaim } from "../../types/llm";
import type { ContextSource, SearchResult } from "../../types/knowledge";
import type { GenerationMetrics } from "../../types/llm";
import type { ResponseLength } from "../../types/workspace";
import { countWords } from "../../features/analytics/qualityMetrics";

// Re-export SearchResult import just to keep the file self-contained
export type { SearchResult };

interface EnrichmentResult {
  enrichmentApplied: boolean;
  status: string;
  fallbackReason?: string | null;
  machineErrorCode?: string | null;
  diagnosticNotes?: string;
  message?: string;
}

interface AlternativeSaveOptions {
  sourcesJson?: string;
  metricsJson?: string;
}

interface UseDraftGenerationOptions {
  input: string;
  ocrText: string | null;
  responseLength: ResponseLength;
  modelLoaded: boolean;
  treeResult: TreeResult | null;
  diagnosticNotes: string;
  currentTicket: JiraTicket | null;
  currentTicketId: string | null;
  savedDraftId: string | null;
  response: string;
  generateStreaming: (
    query: string,
    responseLength: ResponseLength,
    options?: {
      treeDecisions?: TreeDecisions;
      diagnosticNotes?: string;
      jiraTicket?: JiraTicketContext;
    },
  ) => Promise<GenerateWithContextResult>;
  clearStreamingText: () => void;
  enrichDiagnosticNotes: (
    input: string,
    notes: string | undefined,
  ) => Promise<EnrichmentResult>;
  saveAlternative: (
    draftId: string,
    original: string,
    alternative: string,
    options: AlternativeSaveOptions,
  ) => Promise<unknown>;
  loadAlternatives: (draftId: string) => Promise<unknown>;
  chooseAlternative: (
    alternativeId: string,
    choice: "original" | "alternative",
  ) => Promise<unknown>;
  logEvent: (event: string, payload?: Record<string, unknown>) => unknown;
  setResponse: (value: string) => void;
  setOriginalResponse: (value: string) => void;
  setIsResponseEdited: (value: boolean) => void;
  setSources: (value: ContextSource[]) => void;
  setMetrics: (value: GenerationMetrics | null) => void;
  setConfidence: (value: ConfidenceAssessment | null) => void;
  setGrounding: (value: GroundedClaim[]) => void;
  onShowError: (message: string) => void;
}

export function useDraftGeneration({
  input,
  ocrText,
  responseLength,
  modelLoaded,
  treeResult,
  diagnosticNotes,
  currentTicket,
  currentTicketId,
  savedDraftId,
  response,
  generateStreaming,
  clearStreamingText,
  enrichDiagnosticNotes,
  saveAlternative,
  loadAlternatives,
  chooseAlternative,
  logEvent,
  setResponse,
  setOriginalResponse,
  setIsResponseEdited,
  setSources,
  setMetrics,
  setConfidence,
  setGrounding,
  onShowError,
}: UseDraftGenerationOptions) {
  const [generating, setGenerating] = useState(false);
  const [generatingAlternative, setGeneratingAlternative] = useState(false);
  const firstDraftStartMsRef = useRef<number | null>(null);

  const buildCombinedInput = useCallback(
    () => (ocrText ? `${input}\n\n[Screenshot OCR Text]:\n${ocrText}` : input),
    [input, ocrText],
  );

  const buildTreeDecisions = useCallback(
    (): TreeDecisions | undefined =>
      treeResult
        ? {
            tree_name: treeResult.treeName,
            path_summary: treeResult.pathSummary,
          }
        : undefined,
    [treeResult],
  );

  const handleGenerate = useCallback(async () => {
    if (!input.trim() || generating) return;

    if (!modelLoaded) {
      onShowError("No model loaded. Go to Settings to load a model.");
      return;
    }

    setGenerating(true);
    if (firstDraftStartMsRef.current === null) {
      firstDraftStartMsRef.current = Date.now();
    }
    setResponse("");
    clearStreamingText();
    setConfidence(null);
    setGrounding([]);
    try {
      const combinedInput = buildCombinedInput();
      const enrichment = await enrichDiagnosticNotes(
        combinedInput,
        diagnosticNotes || undefined,
      );
      logEvent("memorykernel_enrichment_attempted", {
        applied: enrichment.enrichmentApplied,
        status: enrichment.status,
        fallback_reason: enrichment.fallbackReason,
        machine_error_code: enrichment.machineErrorCode,
      });
      if (!enrichment.enrichmentApplied) {
        console.info("MemoryKernel enrichment skipped:", enrichment.message);
      }

      const result = await generateStreaming(combinedInput, responseLength, {
        treeDecisions: buildTreeDecisions(),
        diagnosticNotes: enrichment.diagnosticNotes,
        jiraTicket: currentTicket || undefined,
      });
      setResponse(result.text);
      setOriginalResponse(result.text);
      setIsResponseEdited(false);
      setSources(result.sources);
      setMetrics(result.metrics ?? null);
      setConfidence(result.confidence ?? null);
      setGrounding(result.grounding ?? []);
      const responseWordCount = countWords(result.text);
      const timeToDraftMs = firstDraftStartMsRef.current
        ? Date.now() - firstDraftStartMsRef.current
        : null;
      logEvent("response_generated", {
        response_length: responseLength,
        tokens_generated: result.tokens_generated,
        duration_ms: result.duration_ms,
        sources_count: result.sources.length,
      });
      logEvent("response_quality_snapshot", {
        draft_id: savedDraftId,
        word_count: responseWordCount,
        edit_ratio: 0,
        time_to_draft_ms: timeToDraftMs,
        has_ticket: !!currentTicketId,
        has_tree_path: !!treeResult,
        has_notes: !!enrichment.diagnosticNotes?.trim(),
      });
    } catch (e) {
      console.error("Generation failed:", e);
      onShowError(`Generation failed: ${e}`);
    } finally {
      setGenerating(false);
    }
  }, [
    input,
    generating,
    modelLoaded,
    responseLength,
    buildCombinedInput,
    buildTreeDecisions,
    treeResult,
    diagnosticNotes,
    currentTicket,
    currentTicketId,
    generateStreaming,
    clearStreamingText,
    enrichDiagnosticNotes,
    logEvent,
    savedDraftId,
    setResponse,
    setOriginalResponse,
    setIsResponseEdited,
    setSources,
    setMetrics,
    setConfidence,
    setGrounding,
    onShowError,
  ]);

  const handleGenerateAlternative = useCallback(async () => {
    if (!response || generating || generatingAlternative || !modelLoaded) {
      return;
    }

    setGeneratingAlternative(true);
    try {
      const combinedInput = buildCombinedInput();
      const result = await generateStreaming(combinedInput, responseLength, {
        treeDecisions: buildTreeDecisions(),
        diagnosticNotes: diagnosticNotes || undefined,
        jiraTicket: currentTicket || undefined,
      });

      if (savedDraftId) {
        await saveAlternative(savedDraftId, response, result.text, {
          sourcesJson:
            result.sources.length > 0
              ? JSON.stringify(result.sources)
              : undefined,
          metricsJson: result.metrics
            ? JSON.stringify(result.metrics)
            : undefined,
        });
        await loadAlternatives(savedDraftId);
      }

      logEvent("alternative_generated", {
        draft_id: savedDraftId,
        tokens_generated: result.tokens_generated,
      });
    } catch (e) {
      console.error("Alternative generation failed:", e);
      onShowError(`Alternative generation failed: ${e}`);
    } finally {
      setGeneratingAlternative(false);
    }
  }, [
    response,
    generating,
    generatingAlternative,
    modelLoaded,
    responseLength,
    buildCombinedInput,
    buildTreeDecisions,
    diagnosticNotes,
    currentTicket,
    generateStreaming,
    savedDraftId,
    saveAlternative,
    loadAlternatives,
    logEvent,
    onShowError,
  ]);

  const handleChooseAlternative = useCallback(
    async (alternativeId: string, choice: "original" | "alternative") => {
      await chooseAlternative(alternativeId, choice);
      if (savedDraftId) {
        await loadAlternatives(savedDraftId);
      }
    },
    [chooseAlternative, loadAlternatives, savedDraftId],
  );

  const handleUseAlternative = useCallback(
    (text: string) => {
      setResponse(text);
      setOriginalResponse(text);
      setIsResponseEdited(false);
    },
    [setResponse, setOriginalResponse, setIsResponseEdited],
  );

  const resetGeneration = useCallback(() => {
    setGenerating(false);
    setGeneratingAlternative(false);
    firstDraftStartMsRef.current = null;
  }, []);

  return {
    generating,
    setGenerating,
    generatingAlternative,
    setGeneratingAlternative,
    firstDraftStartMsRef,
    handleGenerate,
    handleGenerateAlternative,
    handleChooseAlternative,
    handleUseAlternative,
    resetGeneration,
  };
}
