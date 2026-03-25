import { useMemo } from 'react';
import {
  buildEvidencePack,
  buildHandoffPack,
  buildKbDraft,
  buildMissingQuestions,
  buildNextActions,
  serializeCaseIntake,
} from './workspaceAssistant';
import {
  hasMeaningfulWorkspaceDraftContent,
  shouldTreatGuidedRunbookAsWorkspaceProgress,
} from './workspaceDraftSession';
import { calculateEditRatio, countWords } from '../analytics/qualityMetrics';
import type { ContextSource } from '../../types/knowledge';
import type {
  CaseIntake,
  EvidencePack,
  GuidedRunbookSession,
  HandoffPack,
  KbDraft,
  MissingQuestion,
  NextActionRecommendation,
  SavedDraft,
} from '../../types/workspace';
import type { JiraTicketContext } from '../../types/llm';

interface UseWorkspaceDerivedArtifactsParams {
  structuredIntakeEnabled: boolean;
  nextBestActionEnabled: boolean;
  input: string;
  response: string;
  diagnosticNotes: string;
  sources: ContextSource[];
  caseIntake: CaseIntake;
  currentTicket: JiraTicketContext | null;
  currentTicketId: string | null;
  savedDraftId: string | null;
  autosaveDraftId: string | null;
  savedDraftCreatedAt: string | null;
  loadedModelName: string | null;
  buildDiagnosisJson: () => string | null;
  handoffTouched: boolean;
  guidedRunbookNote: string;
  guidedRunbookSession: GuidedRunbookSession | null;
  runbookSessionTouched: boolean;
  runbookSessionSourceScopeKey: string | null;
  workspaceRunbookScopeKey: string;
  checklistItems: Array<{ id: string }>;
  checklistCompleted: Record<string, boolean>;
  firstResponse: string;
  originalResponse: string;
}

export interface WorkspaceDerivedArtifacts {
  handoffPack: HandoffPack;
  serializedCaseIntake: string | null;
  activeWorkspaceDraft: SavedDraft;
  missingQuestions: MissingQuestion[];
  nextActions: NextActionRecommendation[];
  evidencePack: EvidencePack;
  kbDraft: KbDraft;
  hasSaveableWorkspaceContent: boolean;
  hasLiveWorkspaceContent: boolean;
  responseWordCount: number;
  responseEditRatio: number;
  checklistCompletedCount: number;
}

export function useWorkspaceDerivedArtifacts({
  structuredIntakeEnabled,
  nextBestActionEnabled,
  input,
  response,
  diagnosticNotes,
  sources,
  caseIntake,
  currentTicket,
  currentTicketId,
  savedDraftId,
  autosaveDraftId,
  savedDraftCreatedAt,
  loadedModelName,
  buildDiagnosisJson,
  handoffTouched,
  guidedRunbookNote,
  guidedRunbookSession,
  runbookSessionTouched,
  runbookSessionSourceScopeKey,
  workspaceRunbookScopeKey,
  checklistItems,
  checklistCompleted,
  firstResponse,
  originalResponse,
}: UseWorkspaceDerivedArtifactsParams): WorkspaceDerivedArtifacts {
  const handoffPack = useMemo(() => buildHandoffPack({
    inputText: input,
    responseText: response,
    intake: caseIntake,
    sources,
    ticket: currentTicket ?? undefined,
    diagnosticNotes,
  }), [input, response, caseIntake, sources, currentTicket, diagnosticNotes]);

  const serializedCaseIntake = useMemo(
    () => (structuredIntakeEnabled ? serializeCaseIntake(caseIntake) : null),
    [caseIntake, structuredIntakeEnabled],
  );

  const hasSaveableWorkspaceContent = useMemo(() => hasMeaningfulWorkspaceDraftContent({
    inputText: input,
    responseText: response,
    diagnosisJson: buildDiagnosisJson(),
    caseIntake,
    handoffTouched,
    hasGuidedRunbookState: Boolean(
      guidedRunbookNote.trim()
      || shouldTreatGuidedRunbookAsWorkspaceProgress({
        hasGuidedRunbookSession: Boolean(guidedRunbookSession),
        runbookSessionTouched,
        runbookSessionSourceScopeKey,
        workspaceRunbookScopeKey,
      }),
    ),
  }), [
    buildDiagnosisJson,
    caseIntake,
    guidedRunbookNote,
    guidedRunbookSession,
    handoffTouched,
    input,
    response,
    runbookSessionSourceScopeKey,
    runbookSessionTouched,
    workspaceRunbookScopeKey,
  ]);

  const activeWorkspaceDraft = useMemo<SavedDraft>(() => ({
    id: savedDraftId ?? autosaveDraftId ?? 'workspace-draft',
    input_text: input,
    summary_text: currentTicket?.summary ?? null,
    diagnosis_json: buildDiagnosisJson(),
    response_text: response || null,
    ticket_id: currentTicketId,
    kb_sources_json: sources.length > 0 ? JSON.stringify(sources) : null,
    created_at: savedDraftCreatedAt ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_autosave: false,
    model_name: loadedModelName,
    case_intake_json: serializedCaseIntake,
    status: 'draft',
    handoff_summary: handoffPack.summary,
    finalized_at: null,
    finalized_by: null,
  }), [
    savedDraftId,
    autosaveDraftId,
    input,
    currentTicket?.summary,
    buildDiagnosisJson,
    response,
    currentTicketId,
    sources,
    loadedModelName,
    serializedCaseIntake,
    savedDraftCreatedAt,
    handoffPack.summary,
  ]);

  const missingQuestions = useMemo<MissingQuestion[]>(
    () => (nextBestActionEnabled ? buildMissingQuestions(caseIntake) : []),
    [caseIntake, nextBestActionEnabled],
  );

  const nextActions = useMemo<NextActionRecommendation[]>(
    () => (nextBestActionEnabled
      ? buildNextActions({
          inputText: input,
          responseText: response,
          intake: caseIntake,
          sources,
          ticket: currentTicket ?? undefined,
        })
      : []),
    [nextBestActionEnabled, input, response, caseIntake, sources, currentTicket],
  );

  const evidencePack = useMemo<EvidencePack>(() => buildEvidencePack({
    draft: activeWorkspaceDraft,
    intake: caseIntake,
    handoffPack,
    nextActions,
    sources,
  }), [activeWorkspaceDraft, caseIntake, handoffPack, nextActions, sources]);

  const kbDraft = useMemo<KbDraft>(() => buildKbDraft({
    draft: activeWorkspaceDraft,
    intake: caseIntake,
    handoffPack,
    sources,
  }), [activeWorkspaceDraft, caseIntake, handoffPack, sources]);

  const hasLiveWorkspaceContent = useMemo(() => Boolean(
    input.trim()
    || response.trim()
    || diagnosticNotes.trim()
    || firstResponse.trim()
    || checklistItems.length > 0
    || handoffTouched
    || guidedRunbookNote.trim()
    || shouldTreatGuidedRunbookAsWorkspaceProgress({
      hasGuidedRunbookSession: Boolean(guidedRunbookSession),
      runbookSessionTouched,
      runbookSessionSourceScopeKey,
      workspaceRunbookScopeKey,
    }),
  ), [
    diagnosticNotes,
    firstResponse,
    guidedRunbookNote,
    guidedRunbookSession,
    handoffTouched,
    input,
    checklistItems.length,
    response,
    runbookSessionSourceScopeKey,
    runbookSessionTouched,
    workspaceRunbookScopeKey,
  ]);

  const responseWordCount = useMemo(() => countWords(response), [response]);
  const responseEditRatio = useMemo(() => calculateEditRatio(originalResponse, response), [originalResponse, response]);
  const checklistCompletedCount = useMemo(() => checklistItems.reduce((count, item) => {
    return checklistCompleted[item.id] ? count + 1 : count;
  }, 0), [checklistCompleted, checklistItems]);

  return {
    handoffPack,
    serializedCaseIntake,
    activeWorkspaceDraft,
    missingQuestions,
    nextActions,
    evidencePack,
    kbDraft,
    hasSaveableWorkspaceContent,
    hasLiveWorkspaceContent,
    responseWordCount,
    responseEditRatio,
    checklistCompletedCount,
  };
}
