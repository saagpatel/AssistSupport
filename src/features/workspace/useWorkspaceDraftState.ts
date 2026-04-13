import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  parseGuidedRunbookDraftNote,
  parseWorkspaceDraftMetadata,
  resolveLoadedWorkspaceDraftState,
  resolveWorkspaceAutosaveState,
  shouldMigrateVisibleRunbookSession,
} from "./workspaceDraftSession";
import { parseCaseIntake } from "./workspaceAssistant";
import type {
  ChecklistItem,
  ChecklistState,
  ConfidenceAssessment,
  FirstResponseTone,
  GroundedClaim,
} from "../../types/llm";
import type { ContextSource, SearchResult } from "../../types/knowledge";
import type { JiraTicket } from "../../hooks/useJira";
import type {
  CaseIntake,
  GuidedRunbookSession,
  HandoffPack,
  SavedDraft,
  SimilarCase,
  WorkspacePersonalization,
} from "../../types/workspace";

interface UseWorkspaceDraftStateParams {
  workspacePersonalizationStorageKey: string;
  workspacePersonalization: WorkspacePersonalization;
  savedDraftId: string | null;
  setSavedDraftId: (value: string | null) => void;
  setSavedDraftCreatedAt: (value: string | null) => void;
  autosaveDraftId: string | null;
  setAutosaveDraftId: (value: string | null) => void;
  workspaceRunbookScopeKey: string;
  setWorkspaceRunbookScopeKey: (value: string) => void;
  runbookSessionSourceScopeKey: string | null;
  setRunbookSessionSourceScopeKey: (value: string | null) => void;
  runbookSessionTouched: boolean;
  setRunbookSessionTouched: (value: boolean) => void;
  guidedRunbookSession: GuidedRunbookSession | null;
  setGuidedRunbookNote: (value: string) => void;
  hasLiveWorkspaceContent: boolean;
  hasSaveableWorkspaceContent: boolean;
  currentTicket: JiraTicket | null;
  currentTicketId: string | null;
  input: string;
  response: string;
  sources: ContextSource[];
  loadedModelName: string | null;
  serializedCaseIntake: string | null;
  handoffPack: HandoffPack;
  buildDiagnosisJson: () => string | null;
  triggerAutosave: (
    payload: {
      input_text: string;
      summary_text: string | null;
      diagnosis_json: string | null;
      response_text: string | null;
      ticket_id: string | null;
      kb_sources_json: string | null;
      model_name: string | null;
      case_intake_json: string | null;
      handoff_summary: string;
      status: "draft";
    },
    draftId: string,
    enabled: boolean,
  ) => void;
  cancelAutosave: () => void;
  reassignRunbookSessionScope: (
    fromScopeKey: string,
    toScopeKey: string,
  ) => Promise<void>;
  reassignRunbookSessionById: (
    sessionId: string,
    toScopeKey: string,
  ) => Promise<void>;
  preferredNoteAudience: WorkspacePersonalization["preferred_note_audience"];
  setInput: (value: string) => void;
  setResponse: (value: string) => void;
  setOriginalResponse: (value: string) => void;
  setIsResponseEdited: (value: boolean) => void;
  setDiagnosticNotes: (value: string) => void;
  setTreeResult: (value: any) => void;
  setChecklistItems: (value: ChecklistItem[]) => void;
  setChecklistCompleted: (value: Record<string, boolean>) => void;
  setChecklistError: (value: string | null) => void;
  setFirstResponse: (value: string) => void;
  setFirstResponseTone: (value: FirstResponseTone) => void;
  setApprovalQuery: (value: string) => void;
  setApprovalSummary: (value: string) => void;
  setApprovalSources: (value: ContextSource[]) => void;
  setApprovalResults: (value: SearchResult[]) => void;
  setApprovalError: (value: string | null) => void;
  setConfidence: (value: ConfidenceAssessment | null) => void;
  setGrounding: (value: GroundedClaim[]) => void;
  setCurrentTicketId: (value: string | null) => void;
  setCurrentTicket: (value: JiraTicket | null) => void;
  setSources: (value: ContextSource[]) => void;
  setCaseIntake: (value: CaseIntake) => void;
  setHandoffTouched: (value: boolean) => void;
  setCompareCase: (value: SimilarCase | null) => void;
  setOcrText: (value: string | null) => void;
}

export interface WorkspaceDraftState {
  pendingSimilarCaseOpen: SimilarCase | null;
  setPendingSimilarCaseOpen: (value: SimilarCase | null) => void;
  pendingDraftOpen: SavedDraft | null;
  setPendingDraftOpen: (value: SavedDraft | null) => void;
  applyLoadedDraft: (draft: SavedDraft) => void;
  handleLoadDraft: (draft: SavedDraft) => void;
  requestOpenSimilarCase: (similarCase: SimilarCase) => boolean;
}

export function useWorkspaceDraftState({
  workspacePersonalizationStorageKey,
  workspacePersonalization,
  savedDraftId,
  setSavedDraftId,
  setSavedDraftCreatedAt,
  autosaveDraftId,
  setAutosaveDraftId,
  workspaceRunbookScopeKey,
  setWorkspaceRunbookScopeKey,
  runbookSessionSourceScopeKey,
  setRunbookSessionSourceScopeKey,
  runbookSessionTouched,
  setRunbookSessionTouched,
  guidedRunbookSession,
  setGuidedRunbookNote,
  hasLiveWorkspaceContent,
  hasSaveableWorkspaceContent,
  currentTicket,
  currentTicketId,
  input,
  response,
  sources,
  loadedModelName,
  serializedCaseIntake,
  handoffPack,
  buildDiagnosisJson,
  triggerAutosave,
  cancelAutosave,
  reassignRunbookSessionScope,
  reassignRunbookSessionById,
  preferredNoteAudience,
  setInput,
  setResponse,
  setOriginalResponse,
  setIsResponseEdited,
  setDiagnosticNotes,
  setTreeResult,
  setChecklistItems,
  setChecklistCompleted,
  setChecklistError,
  setFirstResponse,
  setFirstResponseTone,
  setApprovalQuery,
  setApprovalSummary,
  setApprovalSources,
  setApprovalResults,
  setApprovalError,
  setConfidence,
  setGrounding,
  setCurrentTicketId,
  setCurrentTicket,
  setSources,
  setCaseIntake,
  setHandoffTouched,
  setCompareCase,
  setOcrText,
}: UseWorkspaceDraftStateParams): WorkspaceDraftState {
  const [pendingSimilarCaseOpen, setPendingSimilarCaseOpen] =
    useState<SimilarCase | null>(null);
  const [pendingDraftOpen, setPendingDraftOpen] = useState<SavedDraft | null>(
    null,
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      workspacePersonalizationStorageKey,
      JSON.stringify(workspacePersonalization),
    );
  }, [workspacePersonalizationStorageKey, workspacePersonalization]);

  const applyLoadedDraft = useCallback(
    (draft: SavedDraft) => {
      const workspaceDraftMetadata = parseWorkspaceDraftMetadata(
        draft.diagnosis_json,
      );
      const loadedDraftState = resolveLoadedWorkspaceDraftState(
        draft.id,
        draft.is_autosave,
        workspaceDraftMetadata,
      );

      setInput(draft.input_text);
      const loadedResponse = draft.response_text || "";
      setResponse(loadedResponse);
      setOriginalResponse(loadedResponse);
      setIsResponseEdited(false);
      setSavedDraftId(loadedDraftState.savedDraftId);
      setSavedDraftCreatedAt(
        draft.is_autosave
          ? workspaceDraftMetadata.savedDraftCreatedAt
          : draft.created_at,
      );
      setAutosaveDraftId(loadedDraftState.autosaveDraftId);
      setWorkspaceRunbookScopeKey(loadedDraftState.workspaceRunbookScopeKey);

      if (draft.diagnosis_json) {
        try {
          const diagData = JSON.parse(draft.diagnosis_json) as {
            notes?: string;
            treeResult?: unknown | null;
            checklist?: ChecklistState | null;
            firstResponse?: { text?: string; tone?: FirstResponseTone } | null;
            approval?: {
              query?: string;
              summary?: string;
              sources?: ContextSource[];
            } | null;
            trust?: {
              confidence?: ConfidenceAssessment | null;
              grounding?: GroundedClaim[];
            } | null;
          };
          setDiagnosticNotes(diagData.notes || "");
          setTreeResult(diagData.treeResult || null);
          const checklistState = diagData.checklist;
          if (checklistState?.items) {
            setChecklistItems(checklistState.items);
            const completed: Record<string, boolean> = {};
            for (const id of checklistState.completed_ids || []) {
              completed[id] = true;
            }
            setChecklistCompleted(completed);
          } else {
            setChecklistItems([]);
            setChecklistCompleted({});
          }
          setChecklistError(null);

          const firstResponseState = diagData.firstResponse;
          if (firstResponseState?.text) {
            setFirstResponse(firstResponseState.text);
            setFirstResponseTone(firstResponseState.tone || "slack");
          } else {
            setFirstResponse("");
            setFirstResponseTone("slack");
          }

          const approvalState = diagData.approval;
          if (approvalState) {
            setApprovalQuery(approvalState.query || "");
            setApprovalSummary(approvalState.summary || "");
            setApprovalSources(approvalState.sources || []);
          } else {
            setApprovalQuery("");
            setApprovalSummary("");
            setApprovalSources([]);
          }
          setApprovalResults([]);
          setApprovalError(null);

          const trustState = diagData.trust;
          setConfidence(trustState?.confidence || null);
          setGrounding(trustState?.grounding || []);
          setGuidedRunbookNote(
            parseGuidedRunbookDraftNote(draft.diagnosis_json),
          );
        } catch {
          setDiagnosticNotes("");
          setTreeResult(null);
          setChecklistItems([]);
          setChecklistCompleted({});
          setChecklistError(null);
          setFirstResponse("");
          setFirstResponseTone("slack");
          setApprovalQuery("");
          setApprovalSummary("");
          setApprovalSources([]);
          setApprovalResults([]);
          setApprovalError(null);
          setConfidence(null);
          setGrounding([]);
          setGuidedRunbookNote("");
        }
      } else {
        setDiagnosticNotes("");
        setTreeResult(null);
        setChecklistItems([]);
        setChecklistCompleted({});
        setChecklistError(null);
        setFirstResponse("");
        setFirstResponseTone("slack");
        setApprovalQuery("");
        setApprovalSummary("");
        setApprovalSources([]);
        setApprovalResults([]);
        setApprovalError(null);
        setConfidence(null);
        setGrounding([]);
        setGuidedRunbookNote("");
      }

      const draftTicketId = draft.ticket_id?.trim() || null;
      setCurrentTicketId(draftTicketId);
      if (draftTicketId) {
        void invoke<JiraTicket>("get_jira_ticket", { ticketKey: draftTicketId })
          .then((ticket) => setCurrentTicket(ticket))
          .catch(() => setCurrentTicket(null));
      } else {
        setCurrentTicket(null);
      }
      if (draft.kb_sources_json) {
        try {
          setSources(JSON.parse(draft.kb_sources_json) as ContextSource[]);
        } catch {
          setSources([]);
        }
      } else {
        setSources([]);
      }
      const parsedIntake = parseCaseIntake(draft.case_intake_json);
      setCaseIntake({
        ...parsedIntake,
        note_audience: parsedIntake.note_audience ?? preferredNoteAudience,
      });
      setHandoffTouched(Boolean(draft.handoff_summary));
      setCompareCase(null);
      setRunbookSessionSourceScopeKey(
        loadedDraftState.workspaceRunbookScopeKey,
      );
      setRunbookSessionTouched(false);
      setPendingSimilarCaseOpen(null);
      setPendingDraftOpen(null);
      setOcrText(null);
    },
    [
      preferredNoteAudience,
      setApprovalError,
      setApprovalQuery,
      setApprovalResults,
      setApprovalSources,
      setApprovalSummary,
      setAutosaveDraftId,
      setCaseIntake,
      setChecklistCompleted,
      setChecklistError,
      setChecklistItems,
      setCompareCase,
      setConfidence,
      setCurrentTicket,
      setCurrentTicketId,
      setDiagnosticNotes,
      setFirstResponse,
      setFirstResponseTone,
      setGrounding,
      setGuidedRunbookNote,
      setHandoffTouched,
      setInput,
      setIsResponseEdited,
      setOcrText,
      setOriginalResponse,
      setResponse,
      setRunbookSessionSourceScopeKey,
      setRunbookSessionTouched,
      setSavedDraftCreatedAt,
      setSavedDraftId,
      setSources,
      setTreeResult,
      setWorkspaceRunbookScopeKey,
    ],
  );

  const handleLoadDraft = useCallback(
    (draft: SavedDraft) => {
      if (draft.id !== savedDraftId && hasLiveWorkspaceContent) {
        setPendingDraftOpen(draft);
        return;
      }

      applyLoadedDraft(draft);
    },
    [applyLoadedDraft, hasLiveWorkspaceContent, savedDraftId],
  );

  const requestOpenSimilarCase = useCallback(
    (similarCase: SimilarCase) => {
      if (similarCase.draft_id !== savedDraftId && hasLiveWorkspaceContent) {
        setPendingSimilarCaseOpen(similarCase);
        return false;
      }

      return true;
    },
    [hasLiveWorkspaceContent, savedDraftId],
  );

  useEffect(() => {
    if (savedDraftId || !autosaveDraftId) {
      return;
    }

    const autosaveScopeKey = `draft:${autosaveDraftId}`;
    const activeRunbookScopeKey = guidedRunbookSession
      ? (runbookSessionSourceScopeKey ?? workspaceRunbookScopeKey)
      : workspaceRunbookScopeKey;
    if (activeRunbookScopeKey === autosaveScopeKey) {
      return;
    }

    let cancelled = false;

    const shouldMigrateActiveRunbookSession = guidedRunbookSession
      ? shouldMigrateVisibleRunbookSession({
          hasGuidedRunbookSession: true,
          runbookSessionTouched,
          runbookSessionSourceScopeKey,
          workspaceRunbookScopeKey,
        })
      : false;

    const activeRunbookSessionId = guidedRunbookSession?.id ?? null;
    const migrateRunbookScope =
      shouldMigrateActiveRunbookSession && activeRunbookSessionId
        ? reassignRunbookSessionById(activeRunbookSessionId, autosaveScopeKey)
        : reassignRunbookSessionScope(
            workspaceRunbookScopeKey,
            autosaveScopeKey,
          );

    void migrateRunbookScope
      .then(() => {
        if (!cancelled) {
          setWorkspaceRunbookScopeKey(autosaveScopeKey);
          setRunbookSessionSourceScopeKey(autosaveScopeKey);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [
    autosaveDraftId,
    guidedRunbookSession,
    reassignRunbookSessionById,
    reassignRunbookSessionScope,
    runbookSessionSourceScopeKey,
    runbookSessionTouched,
    savedDraftId,
    setRunbookSessionSourceScopeKey,
    setWorkspaceRunbookScopeKey,
    workspaceRunbookScopeKey,
  ]);

  useEffect(() => {
    const autosaveState = resolveWorkspaceAutosaveState({
      hasMeaningfulContent: hasSaveableWorkspaceContent,
      savedDraftId,
      autosaveDraftId,
      createDraftId: () => crypto.randomUUID(),
    });

    if (autosaveState.stateAutosaveDraftId !== autosaveDraftId) {
      setAutosaveDraftId(autosaveState.stateAutosaveDraftId);
    }

    if (autosaveState.autosaveRecordId) {
      const diagnosisData = buildDiagnosisJson();

      triggerAutosave(
        {
          input_text: input,
          summary_text: currentTicket?.summary ?? null,
          diagnosis_json: diagnosisData,
          response_text: response || null,
          ticket_id: currentTicketId,
          kb_sources_json: sources.length > 0 ? JSON.stringify(sources) : null,
          model_name: loadedModelName,
          case_intake_json: serializedCaseIntake,
          handoff_summary: handoffPack.summary,
          status: "draft",
        },
        autosaveState.autosaveRecordId,
        hasSaveableWorkspaceContent,
      );
    }
    return () => {
      cancelAutosave();
    };
  }, [
    autosaveDraftId,
    buildDiagnosisJson,
    cancelAutosave,
    currentTicket?.summary,
    currentTicketId,
    handoffPack.summary,
    hasSaveableWorkspaceContent,
    input,
    loadedModelName,
    response,
    savedDraftId,
    serializedCaseIntake,
    setAutosaveDraftId,
    sources,
    triggerAutosave,
  ]);

  return {
    pendingSimilarCaseOpen,
    setPendingSimilarCaseOpen,
    pendingDraftOpen,
    setPendingDraftOpen,
    applyLoadedDraft,
    handleLoadDraft,
    requestOpenSimilarCase,
  };
}
