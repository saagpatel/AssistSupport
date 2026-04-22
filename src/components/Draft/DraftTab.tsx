import {
  useState,
  useCallback,
  forwardRef,
  useImperativeHandle,
  useMemo,
} from "react";
import { buildDiagnosisJson as buildDiagnosisJsonImpl } from "./buildDiagnosisJson";
import {
  type DraftPanelDensityMode,
  DEFAULT_RUNBOOK_TEMPLATES,
  DRAFT_PANEL_DENSITY_STORAGE_KEY,
  WORKSPACE_PERSONALIZATION_STORAGE_KEY,
  createWorkspaceRunbookScopeKey,
  loadWorkspacePersonalization,
  readPanelDensityMode,
} from "./draftTabDefaults";
import { auditResponseCopyOverride, exportDraft } from "./draftTauriCommands";
import type { TreeResult } from "./DiagnosisPanel";
import { ConversationThread } from "./ConversationThread";
import type { ConversationEntry } from "./ConversationThread";
import { useDraftApproval } from "./useDraftApproval";
import { useDraftChecklist } from "./useDraftChecklist";
import { useDraftClear } from "./useDraftClear";
import { useDraftFirstResponse } from "./useDraftFirstResponse";
import { useDraftGeneration } from "./useDraftGeneration";
import { useDraftIntake } from "./useDraftIntake";
import { useDraftLifecycle } from "./useDraftLifecycle";
import { useDraftPersistence } from "./useDraftPersistence";
import { useGuidedRunbook } from "./useGuidedRunbook";
import { useResponseActions } from "./useResponseActions";
import { useWorkspaceArtifacts } from "./useWorkspaceArtifacts";
import { useWorkspaceClipboardPacks } from "./useWorkspaceClipboardPacks";
import { ConversationInput } from "./ConversationInput";
import { useConversationSubmit } from "./useConversationSubmit";
import { WorkspaceDialogs } from "./WorkspaceDialogs";
import { WorkspaceModeShell } from "./WorkspaceModeShell";
import { useLlmGeneration } from "../../hooks/useLlmGeneration";
import { useLlmStreaming } from "../../hooks/useLlmStreaming";
import { useDrafts } from "../../hooks/useDrafts";
import { useKb } from "../../hooks/useKb";
import { useAnalytics } from "../../hooks/useAnalytics";
import { useAlternatives } from "../../hooks/useAlternatives";
import { useSavedResponses } from "../../hooks/useSavedResponses";
import { useMemoryKernelEnrichment } from "../../hooks/useMemoryKernelEnrichment";
import { useWorkspaceOps } from "../../hooks/useWorkspaceOps";
import { useToastContext } from "../../contexts/ToastContext";
import { useAppStatus } from "../../contexts/AppStatusContext";
import { AiReadinessBanner } from "./AiReadinessBanner";
import { resolveRevampFlags } from "../../features/revamp";
import { ClaudeDesignWorkspace } from "../../features/workspace/ClaudeDesignWorkspace";
import { useWorkspaceCatalog } from "../../features/workspace/useWorkspaceCatalog";
import { useWorkspaceDerivedArtifacts } from "../../features/workspace/useWorkspaceDerivedArtifacts";
import { useWorkspaceCommandBridge } from "../../features/workspace/useWorkspaceCommandBridge";
import { useWorkspaceDraftState } from "../../features/workspace/useWorkspaceDraftState";
import type { JiraTicket } from "../../hooks/useJira";
import type {
  ConfidenceAssessment,
  GenerationMetrics,
  GroundedClaim,
} from "../../types/llm";
import type { ContextSource } from "../../types/knowledge";
import type {
  ResponseLength,
  SavedDraft,
  SimilarCase,
  WorkspacePersonalization,
} from "../../types/workspace";
import "./DraftTab.css";

export interface DraftTabHandle {
  generate: () => void;
  loadDraft: (draft: SavedDraft) => void;
  saveDraft: () => void;
  copyResponse: () => void;
  cancelGeneration: () => void;
  exportResponse: () => void;
  clearDraft: () => void;
}

interface DraftTabProps {
  initialDraft?: SavedDraft | null;
  onNavigateToSource?: (searchQuery: string) => void;
  revampModeEnabled?: boolean;
}

export const DraftTab = forwardRef<DraftTabHandle, DraftTabProps>(
  function DraftTab(
    { initialDraft, onNavigateToSource, revampModeEnabled = false },
    ref,
  ) {
    const { error: showError, success: showSuccess } = useToastContext();
    const {
      generateStreaming,
      streamingText,
      isStreaming,
      clearStreamingText,
      cancelGeneration,
    } = useLlmStreaming();
    const {
      generateFirstResponse,
      generateChecklist,
      updateChecklist,
      generateWithContextParams,
    } = useLlmGeneration();
    const {
      saveDraft,
      updateDraft,
      triggerAutosave,
      cancelAutosave,
      loadTemplates,
      searchDrafts,
      getDraft,
    } = useDrafts();
    const { search: searchKb } = useKb();
    const { enrichDiagnosticNotes } = useMemoryKernelEnrichment();
    const { logEvent } = useAnalytics();
    const {
      listResolutionKits,
      saveResolutionKit,
      listWorkspaceFavorites,
      saveWorkspaceFavorite,
      deleteWorkspaceFavorite,
      listRunbookTemplates,
      saveRunbookTemplate,
      startRunbookSession,
      advanceRunbookSession,
      listRunbookSessions,
      reassignRunbookSessionScope,
      reassignRunbookSessionById,
      listRunbookStepEvidence,
      addRunbookStepEvidence,
      saveCaseOutcome,
    } = useWorkspaceOps();
    const appStatus = useAppStatus();
    const workspaceFlags = useMemo(() => resolveRevampFlags(), []);
    const workspaceRailEnabled =
      revampModeEnabled && workspaceFlags.ASSISTSUPPORT_TICKET_WORKSPACE_V2;
    const structuredIntakeEnabled =
      workspaceRailEnabled && workspaceFlags.ASSISTSUPPORT_STRUCTURED_INTAKE;
    const similarCasesEnabled =
      workspaceRailEnabled && workspaceFlags.ASSISTSUPPORT_SIMILAR_CASES;
    const nextBestActionEnabled =
      workspaceRailEnabled && workspaceFlags.ASSISTSUPPORT_NEXT_BEST_ACTION;

    // Use centralized model status from AppStatusContext
    const modelLoaded = appStatus.llmLoaded;
    const loadedModelName = appStatus.llmModelName;

    const {
      approvalQuery,
      setApprovalQuery,
      setApprovalResults,
      approvalSummary,
      setApprovalSummary,
      approvalSources,
      setApprovalSources,
      setApprovalError,
      resetApproval,
    } = useDraftApproval({
      searchKb,
      generateWithContextParams,
      modelLoaded,
      onShowError: showError,
    });

    const [input, setInput] = useState("");
    const [ocrText, setOcrText] = useState<string | null>(null);
    const [diagnosticNotes, setDiagnosticNotes] = useState("");
    const [treeResult, setTreeResult] = useState<TreeResult | null>(null);
    const [response, setResponse] = useState("");
    const [sources, setSources] = useState<ContextSource[]>([]);
    const [metrics, setMetrics] = useState<GenerationMetrics | null>(null);
    const [confidence, setConfidence] = useState<ConfidenceAssessment | null>(
      null,
    );
    const [grounding, setGrounding] = useState<GroundedClaim[]>([]);
    const [workspacePersonalization, setWorkspacePersonalization] =
      useState<WorkspacePersonalization>(loadWorkspacePersonalization);
    const [responseLength, setResponseLength] = useState<ResponseLength>(
      () => loadWorkspacePersonalization().preferred_output_length,
    );
    // Diagnosis is always expanded in the Claude Design workspace layout.
    const diagnosisCollapsed = false;
    const [currentTicketId, setCurrentTicketId] = useState<string | null>(null);
    const [currentTicket, setCurrentTicket] = useState<JiraTicket | null>(null);
    const [originalResponse, setOriginalResponse] = useState<string>("");
    const [isResponseEdited, setIsResponseEdited] = useState(false);
    const [savedDraftId, setSavedDraftId] = useState<string | null>(null);
    const [savedDraftCreatedAt, setSavedDraftCreatedAt] = useState<
      string | null
    >(null);
    const [viewMode, setViewMode] = useState<"panels" | "conversation">(() => {
      return (
        (localStorage.getItem("draft-view-mode") as
          | "panels"
          | "conversation") || "panels"
      );
    });
    const [panelDensityMode, setPanelDensityMode] =
      useState<DraftPanelDensityMode>(readPanelDensityMode);
    const [conversationEntries, setConversationEntries] = useState<
      ConversationEntry[]
    >([]);
    const [handoffTouched, setHandoffTouched] = useState(false);
    const [workspaceRunbookScopeKey, setWorkspaceRunbookScopeKey] =
      useState<string>(createWorkspaceRunbookScopeKey);
    const [autosaveDraftId, setAutosaveDraftId] = useState<string | null>(null);

    // Alternatives & saved responses
    const {
      alternatives,
      loadAlternatives,
      saveAlternative,
      chooseAlternative,
    } = useAlternatives();
    const { findSimilar, saveAsTemplate, incrementUsage } = useSavedResponses();
    const [, setSuggestionsDismissed] = useState(false);

    const {
      generating,
      setGenerating,
      handleGenerate,
      handleUseAlternative,
      resetGeneration,
    } = useDraftGeneration({
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
      onShowError: showError,
    });

    const {
      firstResponse,
      setFirstResponse,
      firstResponseTone,
      setFirstResponseTone,
      resetFirstResponse,
    } = useDraftFirstResponse({
      input,
      ocrText,
      currentTicket,
      modelLoaded,
      generateFirstResponse,
      onShowSuccess: showSuccess,
      onShowError: showError,
    });

    const {
      checklistItems,
      setChecklistItems,
      checklistCompleted,
      setChecklistCompleted,
      setChecklistError,
      resetChecklist,
    } = useDraftChecklist({
      input,
      ocrText,
      diagnosticNotes,
      treeResult,
      currentTicket,
      modelLoaded,
      generateChecklist,
      updateChecklist,
      onShowError: showError,
    });

    const {
      workspaceFavorites,
      runbookTemplates,
      guidedRunbookSession,
      setGuidedRunbookSession,
      runbookSessionSourceScopeKey,
      runbookSessionTouched,
      setRunbookSessionSourceScopeKey,
      setRunbookSessionTouched,
      refreshWorkspaceCatalog,
    } = useWorkspaceCatalog({
      workspaceRailEnabled,
      guidedRunbooksEnabled: workspaceFlags.ASSISTSUPPORT_GUIDED_RUNBOOKS_V2,
      workspaceRunbookScopeKey,
      defaultRunbookTemplates: DEFAULT_RUNBOOK_TEMPLATES,
      ops: {
        listResolutionKits,
        listWorkspaceFavorites,
        listRunbookTemplates,
        saveRunbookTemplate,
        listRunbookSessions,
        listRunbookStepEvidence,
      },
    });

    const {
      caseIntake,
      setCaseIntake,
      handleIntakeFieldChange,
      handleAnalyzeIntake,
    } = useDraftIntake({
      initialNoteAudience: workspacePersonalization.preferred_note_audience,
      input,
      currentTicket,
      currentTicketId,
      response,
      logEvent,
      setWorkspacePersonalization,
    });

    const { guidedRunbookNote, setGuidedRunbookNote } = useGuidedRunbook({
      runbookTemplates,
      guidedRunbookSession,
      workspaceRunbookScopeKey,
      currentTicketId,
      startRunbookSession,
      addRunbookStepEvidence,
      advanceRunbookSession,
      refreshWorkspaceCatalog,
      logEvent,
      setDiagnosticNotes,
      setPanelDensityMode,
      setRunbookSessionSourceScopeKey,
      setRunbookSessionTouched,
      onShowSuccess: showSuccess,
      onShowError: showError,
    });

    const handleResponseLengthChange = useCallback((length: ResponseLength) => {
      setResponseLength(length);
      setWorkspacePersonalization((prev) => ({
        ...prev,
        preferred_output_length: length,
      }));
    }, []);

    const {
      showTemplateModal,
      setShowTemplateModal,
      templateModalRating,
      handleSaveAsTemplate,
      handleTemplateModalSave,
      handleCancel,
      handleCopyResponse,
      handleExportResponse,
      resetResponseActions,
    } = useResponseActions({
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
      onShowSuccess: showSuccess,
      onShowError: showError,
    });

    // Note: legacy suggestion apply/dismiss and tree handlers were tied to
    // InputPanel/DiagnosisPanel; the Claude Design workspace layout does not
    // surface these controls (they were never promoted to PR-worthy UX).
    // `incrementUsage` is still available via useSavedResponses above for
    // future wiring.
    void incrementUsage;

    const handleViewModeChange = useCallback(
      (mode: "panels" | "conversation") => {
        setViewMode(mode);
        localStorage.setItem("draft-view-mode", mode);
      },
      [],
    );

    const handlePanelDensityModeChange = useCallback(
      (mode: DraftPanelDensityMode) => {
        setPanelDensityMode(mode);
        localStorage.setItem(DRAFT_PANEL_DENSITY_STORAGE_KEY, mode);
      },
      [],
    );

    const handleConversationSubmit = useConversationSubmit({
      modelLoaded,
      responseLength,
      generateStreaming,
      clearStreamingText,
      setConversationEntries,
      setInput,
      setGenerating,
      setResponse,
      setOriginalResponse,
      setIsResponseEdited,
      setSources,
      setConfidence,
      setGrounding,
    });

    const buildDiagnosisJson = useCallback(
      () =>
        buildDiagnosisJsonImpl({
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
        }),
      [
        checklistCompleted,
        checklistItems,
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
        savedDraftCreatedAt,
        savedDraftId,
      ],
    );

    const {
      handoffPack,
      serializedCaseIntake,
      activeWorkspaceDraft,
      evidencePack,
      kbDraft,
      hasSaveableWorkspaceContent,
      hasLiveWorkspaceContent,
    } = useWorkspaceDerivedArtifacts({
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
    });

    const {
      setCompareCase,
      handleRefreshSimilarCases,
      handleCompareLastResolution,
      resetWorkspaceArtifacts,
    } = useWorkspaceArtifacts({
      similarCasesEnabled,
      input,
      response,
      currentTicket,
      currentTicketId,
      caseIntake,
      kbDraft,
      sources,
      savedDraftId,
      workspaceFavorites,
      searchDrafts,
      saveResolutionKit,
      saveWorkspaceFavorite,
      deleteWorkspaceFavorite,
      refreshWorkspaceCatalog,
      logEvent,
      setResponse,
      setOriginalResponse,
      setIsResponseEdited,
      setCaseIntake,
      setDiagnosticNotes,
      setPanelDensityMode,
      onShowSuccess: showSuccess,
      onShowError: showError,
    });

    const {
      pendingSimilarCaseOpen,
      setPendingSimilarCaseOpen,
      pendingDraftOpen,
      setPendingDraftOpen,
      applyLoadedDraft,
      handleLoadDraft,
      requestOpenSimilarCase,
    } = useWorkspaceDraftState({
      workspacePersonalizationStorageKey: WORKSPACE_PERSONALIZATION_STORAGE_KEY,
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
      preferredNoteAudience: workspacePersonalization.preferred_note_audience,
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
    });

    const { handleCopyHandoffPack, handleCopyEvidencePack, handleCopyKbDraft } =
      useWorkspaceClipboardPacks({
        handoffPack,
        evidencePack,
        kbDraft,
        caseIntake,
        savedDraftId,
        currentTicketId,
        saveCaseOutcome,
        logEvent,
        onHandoffCopied: () => setHandoffTouched(true),
        onShowSuccess: showSuccess,
        onShowError: showError,
      });

    const handleClear = useDraftClear({
      preferredNoteAudience: workspacePersonalization.preferred_note_audience,
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
    });

    const loadSimilarCaseIntoWorkspace = useCallback(
      async (similarCase: SimilarCase) => {
        const fullDraft = await getDraft(similarCase.draft_id);
        if (!fullDraft) {
          throw new Error("Could not load that saved case");
        }
        handleLoadDraft(fullDraft);
      },
      [getDraft, handleLoadDraft],
    );

    // handleOpenSimilarCase + handleAcceptNextAction were consumed by the
    // old TicketWorkspaceRail; the Claude Design layout does not surface
    // those flows. Helpers kept available for future wiring.
    void loadSimilarCaseIntoWorkspace;
    void requestOpenSimilarCase;
    void setPendingSimilarCaseOpen;

    useWorkspaceCommandBridge({
      enabled: workspaceRailEnabled,
      onAnalyzeIntake: handleAnalyzeIntake,
      onCopyHandoffPack: handleCopyHandoffPack,
      onCopyEvidencePack: handleCopyEvidencePack,
      onCopyKbDraft: handleCopyKbDraft,
      onRefreshSimilarCases: handleRefreshSimilarCases,
      onCompareLastResolution: handleCompareLastResolution,
    });

    const {
      handleSaveDraft,
      handleConfirmOpenDraft,
      handleConfirmOpenSimilarCase,
    } = useDraftPersistence({
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
      onShowSuccess: showSuccess,
      onShowError: showError,
    });

    useDraftLifecycle({
      initialDraft,
      viewMode,
      input,
      savedDraftId,
      refreshWorkspaceCatalog,
      findSimilar,
      loadAlternatives,
      loadTemplates,
      handleLoadDraft,
      onPanelDensityModeChange: handlePanelDensityModeChange,
      setSuggestionsDismissed,
    });

    // Expose functions to parent via ref
    useImperativeHandle(
      ref,
      () => ({
        generate: handleGenerate,
        loadDraft: handleLoadDraft,
        saveDraft: handleSaveDraft,
        copyResponse: handleCopyResponse,
        cancelGeneration: handleCancel,
        exportResponse: handleExportResponse,
        clearDraft: handleClear,
      }),
      [
        handleGenerate,
        handleLoadDraft,
        handleSaveDraft,
        handleCopyResponse,
        handleCancel,
        handleExportResponse,
        handleClear,
      ],
    );

    const isConversation = viewMode === "conversation";

    const viewToggle = (
      <div className="draft-view-header">
        <div className="view-toggle">
          <button
            className={`view-btn ${!isConversation ? "active" : ""}`}
            onClick={() => handleViewModeChange("panels")}
          >
            Panels
          </button>
          <button
            className={`view-btn ${isConversation ? "active" : ""}`}
            onClick={() => handleViewModeChange("conversation")}
          >
            Conversation
          </button>
        </div>
      </div>
    );

    const readinessBanner = (
      <AiReadinessBanner
        modelLoaded={modelLoaded}
        modelName={loadedModelName}
        kbIndexed={appStatus.kbIndexed}
        kbDocumentCount={appStatus.kbDocumentCount}
        kbChunkCount={appStatus.kbChunkCount}
        memoryKernelEnabled={appStatus.memoryKernelFeatureEnabled}
        memoryKernelReady={appStatus.memoryKernelReady}
        memoryKernelStatus={appStatus.memoryKernelStatus}
        memoryKernelDetail={appStatus.memoryKernelDetail}
        onRefreshStatus={() => {
          void appStatus.refresh();
        }}
      />
    );

    const claudeDesignWorkspacePanel = (
      <ClaudeDesignWorkspace
        ticket={currentTicket}
        ticketId={currentTicketId}
        input={input}
        onInputChange={setInput}
        responseLength={responseLength}
        onResponseLengthChange={handleResponseLengthChange}
        hasInput={Boolean(input.trim())}
        hasDiagnosis={Boolean(
          diagnosticNotes.trim() || treeResult || caseIntake.likely_category,
        )}
        hasResponseReady={Boolean(response?.trim())}
        handoffTouched={handoffTouched}
        response={response}
        streamingText={streamingText}
        isStreaming={isStreaming}
        sources={sources}
        metrics={metrics}
        confidence={confidence}
        grounding={grounding}
        alternatives={alternatives}
        generating={generating}
        modelLoaded={modelLoaded}
        loadedModelName={loadedModelName}
        caseIntake={caseIntake}
        onIntakeFieldChange={(field, value) => {
          handleIntakeFieldChange(field, value ?? "");
        }}
        onGenerate={handleGenerate}
        onCancel={handleCancel}
        onCopyResponse={handleCopyResponse}
        onSaveAsTemplate={() => handleSaveAsTemplate(0)}
        onUseAlternative={(alt) => handleUseAlternative(alt.alternative_text)}
        onNavigateToSource={onNavigateToSource}
      />
    );

    const dialogs = (
      <WorkspaceDialogs
        showTemplateModal={showTemplateModal}
        response={response}
        savedDraftId={savedDraftId}
        templateModalRating={templateModalRating}
        onTemplateSave={handleTemplateModalSave}
        onCloseTemplateModal={() => setShowTemplateModal(false)}
        pendingSimilarCaseOpen={pendingSimilarCaseOpen}
        onCloseSimilarCaseDialog={() => setPendingSimilarCaseOpen(null)}
        onConfirmOpenSimilarCase={handleConfirmOpenSimilarCase}
        hasResponse={Boolean(response.trim())}
        pendingDraftOpen={pendingDraftOpen}
        onCloseDraftDialog={() => setPendingDraftOpen(null)}
        onConfirmOpenDraft={handleConfirmOpenDraft}
      />
    );

    return (
      <WorkspaceModeShell
        isConversation={isConversation}
        revampModeEnabled={revampModeEnabled}
        panelDensityMode={panelDensityMode}
        diagnosisCollapsed={diagnosisCollapsed}
        workspaceRailEnabled={workspaceRailEnabled}
        viewToggle={viewToggle}
        readinessBanner={readinessBanner}
        conversationThread={
          <ConversationThread
            entries={conversationEntries}
            streamingText={streamingText}
            isStreaming={isStreaming}
          />
        }
        conversationInput={
          <ConversationInput
            onSubmit={handleConversationSubmit}
            generating={generating}
            modelLoaded={modelLoaded}
            responseLength={responseLength}
            onResponseLengthChange={handleResponseLengthChange}
            onCancel={handleCancel}
          />
        }
        workflowStrip={null}
        panels={claudeDesignWorkspacePanel}
        dialogs={dialogs}
      />
    );
  },
);
