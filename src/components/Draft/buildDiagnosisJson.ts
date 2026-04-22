import type {
  ChecklistItem,
  ConfidenceAssessment,
  GroundedClaim,
} from "../../types/llm";
import type { TreeResult } from "./DiagnosisPanel";
import type { ContextSource } from "../../types/knowledge";

export interface BuildDiagnosisJsonInput {
  checklistItems: ChecklistItem[];
  checklistCompleted: Record<string, boolean>;
  firstResponse: string;
  firstResponseTone: string;
  approvalQuery: string;
  approvalSummary: string;
  approvalSources: ContextSource[];
  diagnosticNotes: string;
  treeResult: TreeResult | null;
  confidence: ConfidenceAssessment | null;
  grounding: GroundedClaim[];
  guidedRunbookNote: string;
  savedDraftId: string | null;
  savedDraftCreatedAt: string | null;
}

/**
 * Serializes the workspace's diagnosis state into a JSON string payload that
 * is persisted alongside a saved draft. Returns null when no meaningful state
 * is present (e.g., an empty workspace with no notes, checklist, or trust
 * signals). Pure function — no React bindings.
 */
export function buildDiagnosisJson(
  input: BuildDiagnosisJsonInput,
): string | null {
  const {
    checklistItems,
    checklistCompleted,
    firstResponse,
    firstResponseTone,
    approvalQuery,
    approvalSummary,
    approvalSources,
    diagnosticNotes,
    treeResult,
    confidence,
    grounding,
    guidedRunbookNote,
    savedDraftId,
    savedDraftCreatedAt,
  } = input;

  const completedIds = Object.keys(checklistCompleted).filter(
    (id) => checklistCompleted[id],
  );
  const checklistState =
    checklistItems.length > 0
      ? { items: checklistItems, completed_ids: completedIds }
      : null;
  const firstResponseState = firstResponse.trim()
    ? { text: firstResponse, tone: firstResponseTone }
    : null;
  const approvalState =
    approvalQuery.trim() || approvalSummary.trim() || approvalSources.length > 0
      ? {
          query: approvalQuery,
          summary: approvalSummary,
          sources: approvalSources,
        }
      : null;
  const trustState =
    confidence || grounding.length > 0 ? { confidence, grounding } : null;

  const diagnosisData: Record<string, unknown> = {};
  if (diagnosticNotes.trim()) {
    diagnosisData.notes = diagnosticNotes;
  }
  if (treeResult) {
    diagnosisData.treeResult = treeResult;
  }
  if (checklistState) {
    diagnosisData.checklist = checklistState;
  }
  if (firstResponseState) {
    diagnosisData.firstResponse = firstResponseState;
  }
  if (approvalState) {
    diagnosisData.approval = approvalState;
  }
  if (trustState) {
    diagnosisData.trust = trustState;
  }
  if (savedDraftId) {
    diagnosisData.workspaceSavedDraftId = savedDraftId;
    diagnosisData.workspaceSavedDraftCreatedAt =
      savedDraftCreatedAt ?? new Date().toISOString();
  }
  if (guidedRunbookNote.trim()) {
    diagnosisData.guidedRunbookDraftNote = guidedRunbookNote;
  }

  return Object.keys(diagnosisData).length > 0
    ? JSON.stringify(diagnosisData)
    : null;
}
