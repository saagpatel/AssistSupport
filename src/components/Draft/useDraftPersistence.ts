import { useCallback } from "react";
import { shouldMigrateVisibleRunbookSession } from "../../features/workspace/workspaceDraftSession";
import { shouldProceedAfterSaveAttempt } from "../../features/workspace/workspaceDraftSession";
import {
  calculateEditRatio,
  countWords,
} from "../../features/analytics/qualityMetrics";
import type { JiraTicket } from "../../hooks/useJira";
import type { ContextSource } from "../../types/knowledge";
import type {
  GuidedRunbookSession,
  HandoffPack,
  SavedDraft,
  SimilarCase,
} from "../../types/workspace";

interface SaveDraftPayload {
  input_text: string;
  summary_text: string | null;
  diagnosis_json: string | null;
  response_text: string | null;
  ticket_id: string | null;
  kb_sources_json: string | null;
  is_autosave: boolean;
  model_name: string | null;
  case_intake_json: string | null;
  handoff_summary: string;
  status: "draft";
}

interface ActiveWorkspaceDraft {
  updated_at: string;
}

interface UseDraftPersistenceOptions {
  input: string;
  response: string;
  sources: ContextSource[];
  currentTicket: JiraTicket | null;
  currentTicketId: string | null;
  savedDraftId: string | null;
  savedDraftCreatedAt: string | null;
  loadedModelName: string | null;
  handoffPack: HandoffPack;
  serializedCaseIntake: string | null;
  isResponseEdited: boolean;
  originalResponse: string;
  hasSaveableWorkspaceContent: boolean;
  activeWorkspaceDraft: ActiveWorkspaceDraft;
  workspaceRunbookScopeKey: string;
  guidedRunbookSession: GuidedRunbookSession | null;
  runbookSessionTouched: boolean;
  runbookSessionSourceScopeKey: string | null;

  buildDiagnosisJson: () => string | null;
  saveDraft: (payload: SaveDraftPayload) => Promise<string | null>;
  updateDraft: (draft: SavedDraft) => Promise<string | null>;
  reassignRunbookSessionById: (
    sessionId: string,
    nextScopeKey: string,
  ) => Promise<unknown>;
  reassignRunbookSessionScope: (
    previousScopeKey: string,
    nextScopeKey: string,
  ) => Promise<unknown>;
  logEvent: (event: string, payload?: Record<string, unknown>) => unknown;

  setWorkspaceRunbookScopeKey: (value: string) => void;
  setRunbookSessionSourceScopeKey: (value: string | null) => void;
  setAutosaveDraftId: (value: string | null) => void;
  setSavedDraftId: (value: string | null) => void;
  setSavedDraftCreatedAt: (value: string | null) => void;

  pendingDraftOpen: SavedDraft | null;
  setPendingDraftOpen: (value: SavedDraft | null) => void;
  applyLoadedDraft: (draft: SavedDraft) => void;

  pendingSimilarCaseOpen: SimilarCase | null;
  setPendingSimilarCaseOpen: (value: SimilarCase | null) => void;
  loadSimilarCaseIntoWorkspace: (similarCase: SimilarCase) => Promise<unknown>;
  setCompareCase: (value: SimilarCase | null) => void;

  onShowSuccess: (message: string) => void;
  onShowError: (message: string) => void;
}

export function useDraftPersistence(options: UseDraftPersistenceOptions) {
  const {
    input,
    response,
    sources,
    currentTicket,
    currentTicketId,
    savedDraftId,
    savedDraftCreatedAt,
    loadedModelName,
    handoffPack,
    serializedCaseIntake,
    isResponseEdited,
    originalResponse,
    hasSaveableWorkspaceContent,
    activeWorkspaceDraft,
    workspaceRunbookScopeKey,
    guidedRunbookSession,
    runbookSessionTouched,
    runbookSessionSourceScopeKey,
    buildDiagnosisJson,
    saveDraft,
    updateDraft,
    reassignRunbookSessionById,
    reassignRunbookSessionScope,
    logEvent,
    setWorkspaceRunbookScopeKey,
    setRunbookSessionSourceScopeKey,
    setAutosaveDraftId,
    setSavedDraftId,
    setSavedDraftCreatedAt,
    pendingDraftOpen,
    setPendingDraftOpen,
    applyLoadedDraft,
    pendingSimilarCaseOpen,
    setPendingSimilarCaseOpen,
    loadSimilarCaseIntoWorkspace,
    setCompareCase,
    onShowSuccess,
    onShowError,
  } = options;

  const handleSaveDraft = useCallback(async (): Promise<string | null> => {
    if (!hasSaveableWorkspaceContent) {
      onShowError("Cannot save empty draft");
      return null;
    }

    const diagnosisData = buildDiagnosisJson();
    const currentCreatedAt = savedDraftCreatedAt ?? new Date().toISOString();
    const draftPayload: SaveDraftPayload = {
      input_text: input,
      summary_text: currentTicket?.summary ?? null,
      diagnosis_json: diagnosisData,
      response_text: response || null,
      ticket_id: currentTicketId,
      kb_sources_json: sources.length > 0 ? JSON.stringify(sources) : null,
      is_autosave: false,
      model_name: loadedModelName,
      case_intake_json: serializedCaseIntake,
      handoff_summary: handoffPack.summary,
      status: "draft",
    };

    const draftId = savedDraftId
      ? await updateDraft({
          id: savedDraftId,
          created_at: currentCreatedAt,
          updated_at: activeWorkspaceDraft.updated_at,
          finalized_at: null,
          finalized_by: null,
          ...draftPayload,
        })
      : await saveDraft(draftPayload);

    if (draftId) {
      const nextScopeKey = `draft:${draftId}`;
      let runbookScopeLinked = true;
      if (workspaceRunbookScopeKey !== nextScopeKey) {
        try {
          const shouldMigrateActiveRunbookSession = guidedRunbookSession
            ? shouldMigrateVisibleRunbookSession({
                hasGuidedRunbookSession: true,
                runbookSessionTouched,
                runbookSessionSourceScopeKey,
                workspaceRunbookScopeKey,
              })
            : false;

          const activeRunbookSessionId = guidedRunbookSession?.id ?? null;
          if (shouldMigrateActiveRunbookSession && activeRunbookSessionId) {
            await reassignRunbookSessionById(
              activeRunbookSessionId,
              nextScopeKey,
            );
          } else {
            await reassignRunbookSessionScope(
              workspaceRunbookScopeKey,
              nextScopeKey,
            );
          }
          setWorkspaceRunbookScopeKey(nextScopeKey);
          setRunbookSessionSourceScopeKey(nextScopeKey);
        } catch {
          runbookScopeLinked = false;
        }
      }
      setAutosaveDraftId(null);
      setSavedDraftId(draftId);
      setSavedDraftCreatedAt(currentCreatedAt);
      const responseWordCount = countWords(response);
      const editRatio = calculateEditRatio(originalResponse, response);
      logEvent("response_saved", {
        draft_id: draftId,
        word_count: responseWordCount,
        is_edited: isResponseEdited,
        edit_ratio: Number(editRatio.toFixed(3)),
      });
      if (runbookScopeLinked) {
        onShowSuccess("Draft saved");
      } else {
        onShowError(
          "Draft saved, but guided runbook progress stayed attached to the previous workspace state",
        );
      }
      return draftId;
    }
    return null;
  }, [
    activeWorkspaceDraft.updated_at,
    buildDiagnosisJson,
    currentTicket?.summary,
    currentTicketId,
    guidedRunbookSession,
    handoffPack.summary,
    hasSaveableWorkspaceContent,
    input,
    isResponseEdited,
    loadedModelName,
    logEvent,
    originalResponse,
    reassignRunbookSessionById,
    reassignRunbookSessionScope,
    response,
    savedDraftCreatedAt,
    runbookSessionSourceScopeKey,
    runbookSessionTouched,
    savedDraftId,
    saveDraft,
    serializedCaseIntake,
    sources,
    updateDraft,
    workspaceRunbookScopeKey,
    setWorkspaceRunbookScopeKey,
    setRunbookSessionSourceScopeKey,
    setAutosaveDraftId,
    setSavedDraftId,
    setSavedDraftCreatedAt,
    onShowSuccess,
    onShowError,
  ]);

  const handleConfirmOpenSimilarCase = useCallback(
    async (mode: "replace" | "save-and-open" | "compare") => {
      if (!pendingSimilarCaseOpen) {
        return;
      }

      if (mode === "compare") {
        setCompareCase(pendingSimilarCaseOpen);
        setPendingSimilarCaseOpen(null);
        return;
      }

      try {
        if (mode === "save-and-open") {
          const savedId = await handleSaveDraft();
          if (!shouldProceedAfterSaveAttempt(mode, savedId)) {
            return;
          }
        }

        await loadSimilarCaseIntoWorkspace(pendingSimilarCaseOpen);
        setPendingSimilarCaseOpen(null);
        void logEvent("workspace_similar_case_opened", {
          ticket_id: currentTicketId,
          similar_case_id: pendingSimilarCaseOpen.draft_id,
          similar_case_ticket: pendingSimilarCaseOpen.ticket_id,
          open_mode: mode,
        });
        onShowSuccess(
          mode === "save-and-open"
            ? "Saved the current workspace and opened the saved case"
            : "Opened the saved case in the workspace",
        );
      } catch {
        onShowError("Failed to open the saved case");
      }
    },
    [
      currentTicketId,
      handleSaveDraft,
      loadSimilarCaseIntoWorkspace,
      logEvent,
      pendingSimilarCaseOpen,
      setCompareCase,
      setPendingSimilarCaseOpen,
      onShowError,
      onShowSuccess,
    ],
  );

  const handleConfirmOpenDraft = useCallback(
    async (mode: "replace" | "save-and-open") => {
      if (!pendingDraftOpen) {
        return;
      }

      try {
        if (mode === "save-and-open") {
          const savedId = await handleSaveDraft();
          if (!shouldProceedAfterSaveAttempt(mode, savedId)) {
            return;
          }
        }

        applyLoadedDraft(pendingDraftOpen);
        setPendingDraftOpen(null);
        onShowSuccess(
          mode === "save-and-open"
            ? "Saved the current workspace and opened the selected draft"
            : "Opened the selected draft in the workspace",
        );
      } catch {
        onShowError("Failed to open the selected draft");
      }
    },
    [
      applyLoadedDraft,
      handleSaveDraft,
      pendingDraftOpen,
      setPendingDraftOpen,
      onShowError,
      onShowSuccess,
    ],
  );

  return {
    handleSaveDraft,
    handleConfirmOpenDraft,
    handleConfirmOpenSimilarCase,
  };
}
