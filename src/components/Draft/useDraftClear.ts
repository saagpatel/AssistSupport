import { useCallback } from "react";
import { parseCaseIntake } from "../../features/workspace/workspaceAssistant";
import type { JiraTicket } from "../../hooks/useJira";
import type { ContextSource } from "../../types/knowledge";
import type {
  ConfidenceAssessment,
  GenerationMetrics,
  GroundedClaim,
} from "../../types/llm";
import type {
  CaseIntake,
  GuidedRunbookSession,
  SimilarCase,
} from "../../types/workspace";
import type { ConversationEntry } from "./ConversationThread";
import { createWorkspaceRunbookScopeKey } from "./draftTabDefaults";
import type { TreeResult } from "./DiagnosisPanel";

// Narrow setter form: this hook only writes plain values, never updater
// functions, so the option types stay assignable from both React useState
// dispatchers and narrower setters returned by sibling hooks.
type Setter<T> = (value: T) => void;

export interface UseDraftClearOptions {
  // Only "changing" read — drives the reset intake's note_audience default
  preferredNoteAudience: CaseIntake["note_audience"];

  // Primitive state writers
  setInput: Setter<string>;
  setOcrText: Setter<string | null>;
  setDiagnosticNotes: Setter<string>;
  setTreeResult: Setter<TreeResult | null>;
  setResponse: Setter<string>;
  setOriginalResponse: Setter<string>;
  setIsResponseEdited: Setter<boolean>;
  setSources: Setter<ContextSource[]>;
  setMetrics: Setter<GenerationMetrics | null>;
  setConfidence: Setter<ConfidenceAssessment | null>;
  setGrounding: Setter<GroundedClaim[]>;
  setCurrentTicketId: Setter<string | null>;
  setCurrentTicket: Setter<JiraTicket | null>;
  setSavedDraftId: Setter<string | null>;
  setSavedDraftCreatedAt: Setter<string | null>;
  setConversationEntries: Setter<ConversationEntry[]>;
  setHandoffTouched: Setter<boolean>;
  setSuggestionsDismissed: Setter<boolean>;
  setCaseIntake: Setter<CaseIntake>;
  setGuidedRunbookSession: Setter<GuidedRunbookSession | null>;
  setGuidedRunbookNote: Setter<string>;
  setRunbookSessionSourceScopeKey: Setter<string | null>;
  setRunbookSessionTouched: Setter<boolean>;
  setAutosaveDraftId: Setter<string | null>;
  setPendingSimilarCaseOpen: Setter<SimilarCase | null>;
  setWorkspaceRunbookScopeKey: Setter<string>;

  // Reset orchestrators exposed by sibling hooks
  resetChecklist: () => void;
  resetFirstResponse: () => void;
  resetApproval: () => void;
  resetResponseActions: () => void;
  resetWorkspaceArtifacts: () => void;
  resetGeneration: () => void;
}

/**
 * Resets every workspace-level piece of state that participates in a draft:
 * inputs, generated output, trust signals, ticket context, workspace
 * artifacts, guided-runbook session, autosave pointer, and suggestion
 * dismissal. Also rotates the workspace runbook scope key so a fresh draft
 * never inherits the prior session's scope.
 *
 * Extracted from DraftTab so the 37-line reset lives next to its hook family
 * and keeps a complete dep array without bloating the orchestrator.
 */
export function useDraftClear({
  preferredNoteAudience,
  setInput,
  setOcrText,
  setDiagnosticNotes,
  setTreeResult,
  setResponse,
  setOriginalResponse,
  setIsResponseEdited,
  setSources,
  setMetrics,
  setConfidence,
  setGrounding,
  setCurrentTicketId,
  setCurrentTicket,
  setSavedDraftId,
  setSavedDraftCreatedAt,
  setConversationEntries,
  setHandoffTouched,
  setSuggestionsDismissed,
  setCaseIntake,
  setGuidedRunbookSession,
  setGuidedRunbookNote,
  setRunbookSessionSourceScopeKey,
  setRunbookSessionTouched,
  setAutosaveDraftId,
  setPendingSimilarCaseOpen,
  setWorkspaceRunbookScopeKey,
  resetChecklist,
  resetFirstResponse,
  resetApproval,
  resetResponseActions,
  resetWorkspaceArtifacts,
  resetGeneration,
}: UseDraftClearOptions) {
  return useCallback(() => {
    setInput("");
    setOcrText(null);
    setDiagnosticNotes("");
    setTreeResult(null);
    resetChecklist();
    resetFirstResponse();
    resetApproval();
    setResponse("");
    setOriginalResponse("");
    setIsResponseEdited(false);
    setSources([]);
    setMetrics(null);
    setConfidence(null);
    setGrounding([]);
    setCurrentTicketId(null);
    setCurrentTicket(null);
    setSavedDraftId(null);
    setSavedDraftCreatedAt(null);
    setConversationEntries([]);
    setHandoffTouched(false);
    resetResponseActions();
    setSuggestionsDismissed(false);
    setCaseIntake({
      ...parseCaseIntake(null),
      note_audience: preferredNoteAudience,
    });
    resetWorkspaceArtifacts();
    setGuidedRunbookSession(null);
    setGuidedRunbookNote("");
    setRunbookSessionSourceScopeKey(null);
    setRunbookSessionTouched(false);
    setAutosaveDraftId(null);
    setPendingSimilarCaseOpen(null);
    setWorkspaceRunbookScopeKey(createWorkspaceRunbookScopeKey());
    resetGeneration();
  }, [
    preferredNoteAudience,
    setInput,
    setOcrText,
    setDiagnosticNotes,
    setTreeResult,
    setResponse,
    setOriginalResponse,
    setIsResponseEdited,
    setSources,
    setMetrics,
    setConfidence,
    setGrounding,
    setCurrentTicketId,
    setCurrentTicket,
    setSavedDraftId,
    setSavedDraftCreatedAt,
    setConversationEntries,
    setHandoffTouched,
    setSuggestionsDismissed,
    setCaseIntake,
    setGuidedRunbookSession,
    setGuidedRunbookNote,
    setRunbookSessionSourceScopeKey,
    setRunbookSessionTouched,
    setAutosaveDraftId,
    setPendingSimilarCaseOpen,
    setWorkspaceRunbookScopeKey,
    resetChecklist,
    resetFirstResponse,
    resetApproval,
    resetResponseActions,
    resetWorkspaceArtifacts,
    resetGeneration,
  ]);
}
