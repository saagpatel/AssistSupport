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
import { DraftResponsePanel } from "./DraftResponsePanel";
import { InputPanel } from "./InputPanel";
import { DiagnosisPanel, TreeResult } from "./DiagnosisPanel";
import { ConversationThread, ConversationEntry } from "./ConversationThread";
import { useDraftApproval } from "./useDraftApproval";
import { useDraftChecklist } from "./useDraftChecklist";
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
import { WorkspaceDialogs } from "./WorkspaceDialogs";
import { WorkspaceModeShell } from "./WorkspaceModeShell";
import { WorkspacePanels } from "./WorkspacePanels";
import { WorkspaceWorkflowStrip } from "./WorkspaceWorkflowStrip";
import { useLlm } from "../../hooks/useLlm";
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
import { TicketWorkspaceRail } from "../../features/workspace/TicketWorkspaceRail";
import { useWorkspaceCatalog } from "../../features/workspace/useWorkspaceCatalog";
import { useWorkspaceDerivedArtifacts } from "../../features/workspace/useWorkspaceDerivedArtifacts";
import { useWorkspaceCommandBridge } from "../../features/workspace/useWorkspaceCommandBridge";
import { useWorkspaceDraftState } from "../../features/workspace/useWorkspaceDraftState";
import {
  compactLines,
  parseCaseIntake,
} from "../../features/workspace/workspaceAssistant";
import { countWords } from "../../features/analytics/qualityMetrics";
import type { JiraTicket } from "../../hooks/useJira";
import type {
  ConfidenceAssessment,
  GenerationMetrics,
  GroundedClaim,
} from "../../types/llm";
import type { ContextSource } from "../../types/knowledge";
import type {
  NextActionRecommendation,
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
      generateFirstResponse,
      generateChecklist,
      updateChecklist,
      generateWithContextParams,
    } = useLlm();
    const {
      saveDraft,
      updateDraft,
      triggerAutosave,
      cancelAutosave,
      templates,
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
      approvalResults,
      setApprovalResults,
      approvalSearching,
      approvalSummary,
      setApprovalSummary,
      approvalSummarizing,
      approvalSources,
      setApprovalSources,
      approvalError,
      setApprovalError,
      handleApprovalSearch,
      handleApprovalSummarize,
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
    const [diagnosisCollapsed, setDiagnosisCollapsed] = useState(false);
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
    const { suggestions, findSimilar, saveAsTemplate, incrementUsage } =
      useSavedResponses();
    const [suggestionsDismissed, setSuggestionsDismissed] = useState(false);

    const {
      generating,
      setGenerating,
      generatingAlternative,
      handleGenerate,
      handleGenerateAlternative,
      handleChooseAlternative,
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
      firstResponseGenerating,
      handleGenerateFirstResponse,
      handleCopyFirstResponse,
      handleClearFirstResponse,
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
      checklistGenerating,
      checklistUpdating,
      checklistError,
      setChecklistError,
      handleChecklistGenerate,
      handleChecklistUpdate,
      handleChecklistToggle,
      handleChecklistClear,
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
      resolutionKits,
      workspaceFavorites,
      runbookTemplates,
      guidedRunbookSession,
      setGuidedRunbookSession,
      workspaceCatalogLoading,
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
      handleApplyIntakePreset,
      handleNoteAudienceChange,
    } = useDraftIntake({
      initialNoteAudience: workspacePersonalization.preferred_note_audience,
      input,
      currentTicket,
      currentTicketId,
      response,
      logEvent,
      setWorkspacePersonalization,
    });

    const {
      guidedRunbookNote,
      setGuidedRunbookNote,
      handleStartGuidedRunbook,
      handleAdvanceGuidedRunbook,
      handleCopyRunbookProgressToNotes,
      handleGuidedRunbookNoteChange,
    } = useGuidedRunbook({
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

    const handleWorkspacePersonalizationChange = useCallback(
      (patch: Partial<WorkspacePersonalization>) => {
        setWorkspacePersonalization((prev) => {
          const next = { ...prev, ...patch };
          if (patch.preferred_note_audience && !savedDraftId) {
            setCaseIntake((current) => ({
              ...current,
              note_audience:
                current.note_audience ??
                patch.preferred_note_audience ??
                next.preferred_note_audience,
            }));
          }
          if (patch.preferred_output_length) {
            setResponseLength(patch.preferred_output_length);
          }
          return next;
        });
      },
      [savedDraftId],
    );

    const {
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

    const handleSuggestionApply = useCallback(
      (content: string, templateId: string) => {
        setResponse(content);
        setOriginalResponse(content);
        setIsResponseEdited(false);
        incrementUsage(templateId);
        setSuggestionsDismissed(true);
      },
      [incrementUsage],
    );

    const handleSuggestionDismiss = useCallback(() => {
      setSuggestionsDismissed(true);
    }, []);

    const handleClear = useCallback(() => {
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
        note_audience: workspacePersonalization.preferred_note_audience,
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
    }, [workspacePersonalization.preferred_note_audience, resetGeneration]);

    const handleTreeComplete = useCallback((result: TreeResult) => {
      setTreeResult(result);
    }, []);

    const handleTreeClear = useCallback(() => {
      setTreeResult(null);
    }, []);

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

    const handleConversationSubmit = useCallback(
      async (text: string) => {
        if (!modelLoaded) return;

        // Add input entry
        const inputEntry: ConversationEntry = {
          id: crypto.randomUUID(),
          type: "input",
          timestamp: new Date().toISOString(),
          content: text,
        };
        setConversationEntries((prev) => [...prev, inputEntry]);
        setInput(text);

        // Generate
        setGenerating(true);
        setResponse("");
        clearStreamingText();
        setConfidence(null);
        setGrounding([]);
        try {
          const result = await generateStreaming(text, responseLength, {});
          setResponse(result.text);
          setOriginalResponse(result.text);
          setIsResponseEdited(false);
          setSources(result.sources);
          setConfidence(result.confidence ?? null);
          setGrounding(result.grounding ?? []);

          // Add response entry
          const responseEntry: ConversationEntry = {
            id: crypto.randomUUID(),
            type: "response",
            timestamp: new Date().toISOString(),
            content: result.text,
            sources: result.sources,
            metrics: result.metrics
              ? {
                  tokens_per_second: result.metrics.tokens_per_second,
                  sources_used: result.metrics.sources_used,
                  word_count: result.metrics.word_count,
                }
              : undefined,
          };
          setConversationEntries((prev) => [...prev, responseEntry]);
        } catch (e) {
          console.error("Generation failed:", e);
        } finally {
          setGenerating(false);
        }
      },
      [modelLoaded, responseLength, generateStreaming, clearStreamingText],
    );

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
      missingQuestions,
      nextActions,
      evidencePack,
      kbDraft,
      hasSaveableWorkspaceContent,
      hasLiveWorkspaceContent,
      responseWordCount,
      responseEditRatio,
      checklistCompletedCount,
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
      similarCases,
      similarCasesLoading,
      compareCase,
      setCompareCase,
      handleRefreshSimilarCases,
      handleCompareLastResolution,
      handleCompareSimilarCase,
      handleSaveCurrentResolutionKit,
      handleApplyResolutionKit,
      handleToggleWorkspaceFavorite,
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

    const handleOpenSimilarCase = useCallback(
      async (similarCase: SimilarCase) => {
        if (!requestOpenSimilarCase(similarCase)) {
          return;
        }

        try {
          await loadSimilarCaseIntoWorkspace(similarCase);
          setPendingSimilarCaseOpen(null);
          void logEvent("workspace_similar_case_opened", {
            ticket_id: currentTicketId,
            similar_case_id: similarCase.draft_id,
            similar_case_ticket: similarCase.ticket_id,
          });
          showSuccess("Loaded similar case into the workspace");
        } catch {
          showError("Failed to open similar case");
        }
      },
      [
        loadSimilarCaseIntoWorkspace,
        logEvent,
        currentTicketId,
        requestOpenSimilarCase,
        setPendingSimilarCaseOpen,
        showError,
        showSuccess,
      ],
    );

    const handleAcceptNextAction = useCallback(
      (action: NextActionRecommendation) => {
        void logEvent("workspace_next_action_accepted", {
          ticket_id: currentTicketId,
          action_kind: action.kind,
          action_id: action.id,
        });

        if (action.kind === "answer") {
          void handleGenerate();
          return;
        }

        if (action.kind === "clarify") {
          const clarifyPrompt = compactLines([
            diagnosticNotes,
            "Clarifying questions to ask:",
            ...missingQuestions.map((question) => `- ${question.question}`),
          ]);
          setDiagnosticNotes(clarifyPrompt);
          setPanelDensityMode("focus-intake");
          showSuccess("Added clarifying questions to the diagnostic notes");
          return;
        }

        if (action.kind === "approval") {
          const querySeed = compactLines([
            caseIntake.issue,
            currentTicket?.summary,
            input,
          ]);
          setApprovalQuery(`${querySeed || "support request"} policy approval`);
          setPanelDensityMode("focus-intake");
          showSuccess("Primed the approval search query");
          return;
        }

        if (action.kind === "runbook") {
          setPanelDensityMode("focus-intake");
          setDiagnosticNotes((prev) =>
            compactLines([
              prev,
              "Runbook kickoff:",
              `- ${action.rationale}`,
              ...action.prerequisites.map((item) => `- ${item}`),
            ]),
          );
          const incidentTemplate = runbookTemplates.find((template) =>
            /incident|security/i.test(`${template.name} ${template.scenario}`),
          );
          if (incidentTemplate) {
            void handleStartGuidedRunbook(incidentTemplate.id);
          }
          showSuccess("Prepared the workspace for guided runbook steps");
          return;
        }

        if (action.kind === "escalate") {
          setCaseIntake((prev) => ({
            ...prev,
            note_audience: "escalation-note",
          }));
          setDiagnosticNotes((prev) =>
            compactLines([prev, "Escalation focus:", `- ${action.rationale}`]),
          );
          showSuccess("Switched the workspace into escalation-note mode");
          return;
        }

        void handleCopyKbDraft();
      },
      [
        logEvent,
        currentTicketId,
        handleGenerate,
        diagnosticNotes,
        missingQuestions,
        showSuccess,
        caseIntake.issue,
        currentTicket?.summary,
        input,
        runbookTemplates,
        handleStartGuidedRunbook,
        handleCopyKbDraft,
      ],
    );

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

    const workflowStrip = (
      <WorkspaceWorkflowStrip
        inputWordCount={countWords(input)}
        currentTicketId={currentTicketId}
        treeCompleted={Boolean(treeResult)}
        checklistCompletedCount={checklistCompletedCount}
        checklistItemCount={checklistItems.length}
        responseWordCount={responseWordCount}
        isResponseEdited={isResponseEdited}
        responseEditRatio={responseEditRatio}
        hasResponseReady={Boolean(response?.trim())}
        handoffTouched={handoffTouched}
        panelDensityMode={panelDensityMode}
        modelLoaded={modelLoaded}
        firstResponseGenerating={firstResponseGenerating}
        checklistGenerating={checklistGenerating}
        generating={generating}
        hasInput={Boolean(input.trim())}
        hasChecklistInput={Boolean(
          input.trim() || ocrText?.trim() || currentTicket,
        )}
        onPanelDensityModeChange={handlePanelDensityModeChange}
        onGenerateFirstResponse={handleGenerateFirstResponse}
        onChecklistGenerate={handleChecklistGenerate}
        onGenerate={handleGenerate}
        onSaveDraft={() => {
          void handleSaveDraft();
        }}
      />
    );

    const inputPanel = (
      <InputPanel
        value={input}
        onChange={setInput}
        ocrText={ocrText}
        onOcrTextChange={setOcrText}
        onGenerate={handleGenerate}
        onClear={handleClear}
        generating={generating}
        modelLoaded={modelLoaded}
        responseLength={responseLength}
        onResponseLengthChange={handleResponseLengthChange}
        ticketId={currentTicketId}
        onTicketIdChange={setCurrentTicketId}
        ticket={currentTicket}
        onTicketChange={setCurrentTicket}
        firstResponse={firstResponse}
        onFirstResponseChange={setFirstResponse}
        firstResponseTone={firstResponseTone}
        onFirstResponseToneChange={setFirstResponseTone}
        onGenerateFirstResponse={handleGenerateFirstResponse}
        onCopyFirstResponse={handleCopyFirstResponse}
        onClearFirstResponse={handleClearFirstResponse}
        firstResponseGenerating={firstResponseGenerating}
        templates={templates}
        onApplyTemplate={handleApplyTemplate}
        onNavigateToSource={onNavigateToSource}
      />
    );

    const diagnosisPanel = (
      <DiagnosisPanel
        input={input}
        ocrText={ocrText}
        notes={diagnosticNotes}
        onNotesChange={setDiagnosticNotes}
        treeResult={treeResult}
        onTreeComplete={handleTreeComplete}
        onTreeClear={handleTreeClear}
        checklistItems={checklistItems}
        checklistCompleted={checklistCompleted}
        checklistGenerating={checklistGenerating}
        checklistUpdating={checklistUpdating}
        checklistError={checklistError}
        onChecklistToggle={handleChecklistToggle}
        onChecklistGenerate={handleChecklistGenerate}
        onChecklistUpdate={handleChecklistUpdate}
        onChecklistClear={handleChecklistClear}
        approvalQuery={approvalQuery}
        onApprovalQueryChange={setApprovalQuery}
        approvalResults={approvalResults}
        approvalSearching={approvalSearching}
        approvalSummary={approvalSummary}
        approvalSummarizing={approvalSummarizing}
        approvalSources={approvalSources}
        onApprovalSearch={handleApprovalSearch}
        onApprovalSummarize={handleApprovalSummarize}
        approvalError={approvalError}
        modelLoaded={modelLoaded}
        hasTicket={!!currentTicket}
        collapsed={diagnosisCollapsed}
        onToggleCollapse={() => setDiagnosisCollapsed(!diagnosisCollapsed)}
      />
    );

    const responsePanel = (
      <DraftResponsePanel
        suggestions={suggestions}
        suggestionsDismissed={suggestionsDismissed}
        onSuggestionApply={handleSuggestionApply}
        onSuggestionDismiss={handleSuggestionDismiss}
        response={response}
        streamingText={streamingText}
        isStreaming={isStreaming}
        sources={sources}
        generating={generating}
        metrics={metrics}
        confidence={confidence}
        grounding={grounding}
        savedDraftId={savedDraftId}
        hasInput={!!input.trim()}
        isResponseEdited={isResponseEdited}
        loadedModelName={loadedModelName}
        currentTicketId={currentTicketId}
        onSaveDraft={handleSaveDraft}
        onCancel={handleCancel}
        onResponseChange={handleResponseChange}
        onGenerateAlternative={handleGenerateAlternative}
        generatingAlternative={generatingAlternative}
        onSaveAsTemplate={handleSaveAsTemplate}
        alternatives={alternatives}
        onChooseAlternative={handleChooseAlternative}
        onUseAlternative={handleUseAlternative}
      />
    );

    const workspacePanel = (
      <TicketWorkspaceRail
        intake={{
          data: caseIntake,
          onChange: handleIntakeFieldChange,
          onAnalyze: handleAnalyzeIntake,
          onApplyPreset: handleApplyIntakePreset,
          onNoteAudienceChange: handleNoteAudienceChange,
          missingQuestions,
        }}
        nextActions={{
          items: nextActions,
          onAccept: handleAcceptNextAction,
        }}
        similarCases={{
          items: similarCases,
          loading: similarCasesLoading,
          onRefresh: handleRefreshSimilarCases,
          onOpen: handleOpenSimilarCase,
          onCompare: handleCompareSimilarCase,
          onCompareLast: handleCompareLastResolution,
          compareCase,
          onCloseCompare: () => setCompareCase(null),
        }}
        packs={{
          handoffPack,
          evidencePack,
          kbDraft,
          onCopyHandoff: handleCopyHandoffPack,
          onCopyEvidence: handleCopyEvidencePack,
          onCopyKb: handleCopyKbDraft,
        }}
        kits={{
          items: resolutionKits,
          onSaveCurrent: handleSaveCurrentResolutionKit,
          onApply: handleApplyResolutionKit,
        }}
        favorites={{
          items: workspaceFavorites,
          onToggle: handleToggleWorkspaceFavorite,
        }}
        runbooks={{
          templates: runbookTemplates,
          session: guidedRunbookSession,
          note: guidedRunbookNote,
          onNoteChange: handleGuidedRunbookNoteChange,
          onStart: handleStartGuidedRunbook,
          onAdvance: handleAdvanceGuidedRunbook,
          onCopyProgress: handleCopyRunbookProgressToNotes,
        }}
        personalization={{
          value: workspacePersonalization,
          onChange: handleWorkspacePersonalizationChange,
        }}
        workspaceCatalogLoading={workspaceCatalogLoading}
        currentResponse={response}
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
        workflowStrip={workflowStrip}
        panels={
          <WorkspacePanels
            diagnosisCollapsed={diagnosisCollapsed}
            workspaceRailEnabled={workspaceRailEnabled}
            inputPanel={inputPanel}
            diagnosisPanel={diagnosisPanel}
            responsePanel={responsePanel}
            workspacePanel={workspacePanel}
          />
        }
        dialogs={dialogs}
      />
    );
  },
);
