import { useCallback, useState } from "react";
import {
  calculateEditRatio,
  countWords,
} from "../../features/analytics/qualityMetrics";
import type { ConfidenceAssessment } from "../../types/llm";
import type { ContextSource } from "../../types/knowledge";

interface TemplateSaveOptions {
  sourceDraftId?: string;
  sourceRating?: number;
  category?: string;
  variablesJson?: string;
}

interface AuditResponseCopyOverrideParams {
  reason: string;
  confidenceMode: string | null;
  sourcesCount: number;
}

interface ExportDraftParams {
  responseText: string;
  format: "Markdown";
}

interface UseResponseActionsOptions {
  response: string;
  originalResponse: string;
  isResponseEdited: boolean;
  confidence: ConfidenceAssessment | null;
  sources: ContextSource[];
  savedDraftId: string | null;
  streamingText: string;

  cancelGeneration: () => void;
  saveAsTemplate: (
    name: string,
    content: string,
    options: TemplateSaveOptions,
  ) => Promise<string | null>;
  auditResponseCopyOverride: (
    params: AuditResponseCopyOverrideParams,
  ) => Promise<unknown>;
  exportDraft: (params: ExportDraftParams) => Promise<boolean>;
  logEvent: (event: string, payload?: Record<string, unknown>) => unknown;

  setResponse: (value: string) => void;
  setOriginalResponse: (value: string) => void;
  setIsResponseEdited: (value: boolean) => void;
  setGenerating: (value: boolean) => void;
  setHandoffTouched: (value: boolean) => void;

  onShowSuccess: (message: string) => void;
  onShowError: (message: string) => void;
}

export function useResponseActions({
  response,
  originalResponse,
  isResponseEdited,
  confidence,
  sources,
  savedDraftId,
  streamingText,
  cancelGeneration,
  saveAsTemplate,
  auditResponseCopyOverride,
  exportDraft,
  logEvent,
  setResponse,
  setOriginalResponse,
  setIsResponseEdited,
  setGenerating,
  setHandoffTouched,
  onShowSuccess,
  onShowError,
}: UseResponseActionsOptions) {
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templateModalRating, setTemplateModalRating] = useState<
    number | undefined
  >(undefined);

  const handleApplyTemplate = useCallback(
    (content: string) => {
      setResponse(content);
    },
    [setResponse],
  );

  const handleSaveAsTemplate = useCallback((rating: number) => {
    setTemplateModalRating(rating);
    setShowTemplateModal(true);
  }, []);

  const handleTemplateModalSave = useCallback(
    async (
      name: string,
      category: string | null,
      content: string,
      variablesJson: string | null,
    ): Promise<boolean> => {
      const id = await saveAsTemplate(name, content, {
        sourceDraftId: savedDraftId ?? undefined,
        sourceRating: templateModalRating,
        category: category ?? undefined,
        variablesJson: variablesJson ?? undefined,
      });
      if (id) {
        onShowSuccess("Response saved as template");
        return true;
      }
      onShowError("Failed to save template");
      return false;
    },
    [
      saveAsTemplate,
      savedDraftId,
      templateModalRating,
      onShowSuccess,
      onShowError,
    ],
  );

  const handleResponseChange = useCallback(
    (text: string) => {
      setResponse(text);
      setIsResponseEdited(text !== originalResponse);
    },
    [originalResponse, setResponse, setIsResponseEdited],
  );

  const handleCancel = useCallback(async () => {
    await cancelGeneration();
    setGenerating(false);
    if (streamingText) {
      setResponse(streamingText);
      setOriginalResponse(streamingText);
      setIsResponseEdited(false);
    }
  }, [
    cancelGeneration,
    streamingText,
    setGenerating,
    setResponse,
    setOriginalResponse,
    setIsResponseEdited,
  ]);

  const handleCopyResponse = useCallback(async () => {
    if (!response) return;
    try {
      const mode = confidence?.mode ?? "answer";
      const hasCitations = sources.length > 0;
      const copyAllowed = mode === "answer" && hasCitations;

      if (!copyAllowed) {
        const reason = window.prompt(
          "Copy override required. This response is missing citations or is not in answer mode.\n\nEnter a reason to proceed (will be logged locally):",
        );
        if (!reason || !reason.trim()) {
          onShowError("Copy cancelled (reason required).");
          return;
        }
        await auditResponseCopyOverride({
          reason: reason.trim(),
          confidenceMode: confidence?.mode ?? null,
          sourcesCount: sources.length,
        });
      }
      await navigator.clipboard.writeText(response);
      setHandoffTouched(true);
      logEvent("response_copied", {
        draft_id: savedDraftId,
        word_count: countWords(response),
        is_edited: isResponseEdited,
        edit_ratio: Number(
          calculateEditRatio(originalResponse, response).toFixed(3),
        ),
      });
      onShowSuccess("Response copied to clipboard");
    } catch {
      onShowError("Failed to copy response");
    }
  }, [
    response,
    confidence?.mode,
    sources.length,
    auditResponseCopyOverride,
    logEvent,
    savedDraftId,
    isResponseEdited,
    originalResponse,
    setHandoffTouched,
    onShowSuccess,
    onShowError,
  ]);

  const handleExportResponse = useCallback(async () => {
    if (!response) {
      onShowError("No response to export");
      return;
    }
    try {
      const saved = await exportDraft({
        responseText: response,
        format: "Markdown",
      });
      if (saved) {
        setHandoffTouched(true);
        onShowSuccess("Response exported successfully");
      }
    } catch (e) {
      onShowError(`Export failed: ${e}`);
    }
  }, [response, exportDraft, setHandoffTouched, onShowSuccess, onShowError]);

  const resetResponseActions = useCallback(() => {
    setShowTemplateModal(false);
    setTemplateModalRating(undefined);
  }, []);

  return {
    showTemplateModal,
    setShowTemplateModal,
    templateModalRating,
    handleApplyTemplate,
    handleSaveAsTemplate,
    handleTemplateModalSave,
    handleResponseChange,
    handleCancel,
    handleCopyResponse,
    handleExportResponse,
    resetResponseActions,
  };
}
