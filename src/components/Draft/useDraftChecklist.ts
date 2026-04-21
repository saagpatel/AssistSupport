import { useCallback, useState } from "react";
import type { TreeResult } from "./DiagnosisPanel";
import type { JiraTicket } from "../../hooks/useJira";
import type { ChecklistItem, ChecklistState } from "../../types/llm";

interface ChecklistRequestParams {
  user_input: string;
  ocr_text?: string;
  diagnostic_notes?: string;
  tree_decisions?: { tree_name: string; path_summary: string };
  jira_ticket?: JiraTicket;
}

interface UseDraftChecklistOptions {
  input: string;
  ocrText: string | null;
  diagnosticNotes: string;
  treeResult: TreeResult | null;
  currentTicket: JiraTicket | null;
  modelLoaded: boolean;
  generateChecklist: (
    params: ChecklistRequestParams,
  ) => Promise<{ items: ChecklistItem[] }>;
  updateChecklist: (
    params: ChecklistRequestParams & { checklist: ChecklistState },
  ) => Promise<{ items: ChecklistItem[] }>;
  onShowError: (message: string) => void;
}

export function useDraftChecklist({
  input,
  ocrText,
  diagnosticNotes,
  treeResult,
  currentTicket,
  modelLoaded,
  generateChecklist,
  updateChecklist,
  onShowError,
}: UseDraftChecklistOptions) {
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [checklistCompleted, setChecklistCompleted] = useState<
    Record<string, boolean>
  >({});
  const [checklistGenerating, setChecklistGenerating] = useState(false);
  const [checklistUpdating, setChecklistUpdating] = useState(false);
  const [checklistError, setChecklistError] = useState<string | null>(null);

  const buildPromptInput = useCallback(() => {
    const ticketFallback = currentTicket
      ? `${currentTicket.summary}${currentTicket.description ? `\n\n${currentTicket.description}` : ""}`
      : "";
    return input.trim() || ticketFallback.trim() || ocrText?.trim() || "";
  }, [currentTicket, input, ocrText]);

  const handleChecklistGenerate = useCallback(async () => {
    if (checklistGenerating) return;

    if (!modelLoaded) {
      onShowError("No model loaded. Go to Settings to load a model.");
      return;
    }

    const promptInput = buildPromptInput();
    if (!promptInput) {
      setChecklistError(
        "Add ticket details or notes before generating a checklist.",
      );
      return;
    }

    setChecklistGenerating(true);
    setChecklistError(null);
    try {
      const treeDecisions = treeResult
        ? {
            tree_name: treeResult.treeName,
            path_summary: treeResult.pathSummary,
          }
        : undefined;

      const result = await generateChecklist({
        user_input: promptInput,
        ocr_text: ocrText ?? undefined,
        diagnostic_notes: diagnosticNotes || undefined,
        tree_decisions: treeDecisions,
        jira_ticket: currentTicket ?? undefined,
      });

      setChecklistItems(result.items);
      setChecklistCompleted({});
    } catch (e) {
      console.error("Checklist generation failed:", e);
      setChecklistError(`Checklist failed: ${e}`);
    } finally {
      setChecklistGenerating(false);
    }
  }, [
    buildPromptInput,
    checklistGenerating,
    modelLoaded,
    treeResult,
    ocrText,
    diagnosticNotes,
    currentTicket,
    generateChecklist,
    onShowError,
  ]);

  const handleChecklistUpdate = useCallback(async () => {
    if (!checklistItems.length || checklistUpdating) return;

    if (!modelLoaded) {
      onShowError("No model loaded. Go to Settings to load a model.");
      return;
    }

    const promptInput = buildPromptInput();
    if (!promptInput) {
      setChecklistError(
        "Add ticket details or notes before updating the checklist.",
      );
      return;
    }

    setChecklistUpdating(true);
    setChecklistError(null);
    try {
      const treeDecisions = treeResult
        ? {
            tree_name: treeResult.treeName,
            path_summary: treeResult.pathSummary,
          }
        : undefined;

      const completedIds = Object.keys(checklistCompleted).filter(
        (id) => checklistCompleted[id],
      );
      const checklist: ChecklistState = {
        items: checklistItems,
        completed_ids: completedIds,
      };

      const result = await updateChecklist({
        user_input: promptInput,
        ocr_text: ocrText ?? undefined,
        diagnostic_notes: diagnosticNotes || undefined,
        tree_decisions: treeDecisions,
        jira_ticket: currentTicket ?? undefined,
        checklist,
      });

      const updatedCompleted: Record<string, boolean> = {};
      for (const item of result.items) {
        if (checklistCompleted[item.id]) {
          updatedCompleted[item.id] = true;
        }
      }

      setChecklistItems(result.items);
      setChecklistCompleted(updatedCompleted);
    } catch (e) {
      console.error("Checklist update failed:", e);
      setChecklistError(`Checklist update failed: ${e}`);
    } finally {
      setChecklistUpdating(false);
    }
  }, [
    buildPromptInput,
    checklistItems,
    checklistUpdating,
    modelLoaded,
    ocrText,
    diagnosticNotes,
    treeResult,
    currentTicket,
    checklistCompleted,
    updateChecklist,
    onShowError,
  ]);

  const handleChecklistToggle = useCallback((id: string) => {
    setChecklistCompleted((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  }, []);

  const handleChecklistClear = useCallback(() => {
    setChecklistItems([]);
    setChecklistCompleted({});
    setChecklistError(null);
  }, []);

  const resetChecklist = useCallback(() => {
    setChecklistItems([]);
    setChecklistCompleted({});
    setChecklistError(null);
    setChecklistGenerating(false);
    setChecklistUpdating(false);
  }, []);

  return {
    checklistItems,
    setChecklistItems,
    checklistCompleted,
    setChecklistCompleted,
    checklistGenerating,
    checklistUpdating,
    checklistError,
    setChecklistError,
    handleChecklistGenerate,
    handleChecklistUpdate,
    handleChecklistToggle,
    handleChecklistClear,
    resetChecklist,
  };
}
