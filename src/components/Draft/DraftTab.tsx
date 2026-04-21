import {
  useState,
  useCallback,
  useEffect,
  forwardRef,
  useImperativeHandle,
  useMemo,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { DraftResponsePanel } from "./DraftResponsePanel";
import { InputPanel } from "./InputPanel";
import { DiagnosisPanel, TreeResult } from "./DiagnosisPanel";
import { ConversationThread, ConversationEntry } from "./ConversationThread";
import { useDraftApproval } from "./useDraftApproval";
import { useDraftChecklist } from "./useDraftChecklist";
import { useDraftFirstResponse } from "./useDraftFirstResponse";
import { useDraftGeneration } from "./useDraftGeneration";
import { useDraftIntake } from "./useDraftIntake";
import { useGuidedRunbook } from "./useGuidedRunbook";
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
  applyResolutionKit,
  buildResolutionKitFromWorkspace,
  buildSimilarCases,
  compactLines,
  parseCaseIntake,
} from "../../features/workspace/workspaceAssistant";
import {
  shouldMigrateVisibleRunbookSession,
  shouldProceedAfterSaveAttempt,
} from "../../features/workspace/workspaceDraftSession";
import {
  calculateEditRatio,
  countWords,
} from "../../features/analytics/qualityMetrics";
import type { JiraTicket } from "../../hooks/useJira";
import type {
  ConfidenceAssessment,
  GenerationMetrics,
  GroundedClaim,
} from "../../types/llm";
import type { ContextSource } from "../../types/knowledge";
import type {
  GuidedRunbookTemplate,
  NextActionRecommendation,
  ResolutionKit,
  ResponseLength,
  SavedDraft,
  SimilarCase,
  WorkspaceFavorite,
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

type DraftPanelDensityMode = "balanced" | "focus-intake" | "focus-response";

const DRAFT_PANEL_DENSITY_STORAGE_KEY = "draft-panel-density-mode";
const WORKSPACE_PERSONALIZATION_STORAGE_KEY =
  "assistsupport.workspace.personalization.v1";

const DEFAULT_WORKSPACE_PERSONALIZATION: WorkspacePersonalization = {
  preferred_note_audience: "internal-note",
  preferred_output_length: "Medium",
  favorite_queue_view: "all",
  default_evidence_format: "clipboard",
};

const DEFAULT_RUNBOOK_TEMPLATES: Array<Omit<GuidedRunbookTemplate, "id">> = [
  {
    name: "Security Incident",
    scenario: "security-incident",
    steps: [
      "Acknowledge the incident",
      "Confirm scope and impacted users",
      "Contain access or affected systems",
      "Notify stakeholders",
      "Prepare escalation or recovery note",
    ],
  },
  {
    name: "Access Request Review",
    scenario: "access-request",
    steps: [
      "Confirm requester identity",
      "Check policy or entitlement path",
      "Verify required approver",
      "Document evidence and approval state",
      "Communicate approved or denied outcome",
    ],
  },
  {
    name: "Device Troubleshooting",
    scenario: "device-troubleshooting",
    steps: [
      "Capture symptoms and environment",
      "Verify recent changes",
      "Run standard checks or reboot path",
      "Collect logs or screenshots",
      "Escalate with evidence if unresolved",
    ],
  },
];

function loadWorkspacePersonalization(): WorkspacePersonalization {
  if (typeof window === "undefined") {
    return DEFAULT_WORKSPACE_PERSONALIZATION;
  }

  try {
    const raw = window.localStorage.getItem(
      WORKSPACE_PERSONALIZATION_STORAGE_KEY,
    );
    if (!raw) {
      return DEFAULT_WORKSPACE_PERSONALIZATION;
    }

    const parsed = JSON.parse(raw) as Partial<WorkspacePersonalization>;
    return {
      preferred_note_audience:
        parsed.preferred_note_audience ??
        DEFAULT_WORKSPACE_PERSONALIZATION.preferred_note_audience,
      preferred_output_length:
        parsed.preferred_output_length ??
        DEFAULT_WORKSPACE_PERSONALIZATION.preferred_output_length,
      favorite_queue_view:
        parsed.favorite_queue_view ??
        DEFAULT_WORKSPACE_PERSONALIZATION.favorite_queue_view,
      default_evidence_format:
        parsed.default_evidence_format ??
        DEFAULT_WORKSPACE_PERSONALIZATION.default_evidence_format,
    };
  } catch {
    return DEFAULT_WORKSPACE_PERSONALIZATION;
  }
}

function createWorkspaceScopeSeed(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `workspace-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function createWorkspaceRunbookScopeKey(): string {
  return `workspace:${createWorkspaceScopeSeed()}`;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName.toLowerCase();
  return (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    target.isContentEditable
  );
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
      useState<DraftPanelDensityMode>(() => {
        const stored = localStorage.getItem(DRAFT_PANEL_DENSITY_STORAGE_KEY);
        if (
          stored === "balanced" ||
          stored === "focus-intake" ||
          stored === "focus-response"
        ) {
          return stored;
        }
        return "balanced";
      });
    const [conversationEntries, setConversationEntries] = useState<
      ConversationEntry[]
    >([]);
    const [handoffTouched, setHandoffTouched] = useState(false);
    const [similarCases, setSimilarCases] = useState<SimilarCase[]>([]);
    const [similarCasesLoading, setSimilarCasesLoading] = useState(false);
    const [compareCase, setCompareCase] = useState<SimilarCase | null>(null);
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
    const [showTemplateModal, setShowTemplateModal] = useState(false);
    const [templateModalRating, setTemplateModalRating] = useState<
      number | undefined
    >(undefined);
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

    useEffect(() => {
      void refreshWorkspaceCatalog();
    }, [refreshWorkspaceCatalog]);

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

    const handleRefreshSimilarCases = useCallback(async () => {
      if (!similarCasesEnabled) {
        setSimilarCases([]);
        return;
      }

      const query = [
        input,
        currentTicket?.summary,
        caseIntake.issue,
        caseIntake.symptoms,
      ]
        .filter((value): value is string => Boolean(value?.trim()))
        .join(" ");

      if (!query.trim()) {
        setSimilarCases([]);
        return;
      }

      setSimilarCasesLoading(true);
      try {
        const results = await searchDrafts(query, 20);
        const next = buildSimilarCases({
          currentDraftId: savedDraftId,
          queryText: query,
          drafts: results,
        });
        setSimilarCases(next);
      } finally {
        setSimilarCasesLoading(false);
      }
    }, [
      similarCasesEnabled,
      input,
      currentTicket?.summary,
      caseIntake.issue,
      caseIntake.symptoms,
      searchDrafts,
      savedDraftId,
    ]);

    const handleCompareLastResolution = useCallback(() => {
      if (!response.trim()) {
        showError(
          "Generate or paste a response before comparing it to a prior resolution",
        );
        return;
      }

      const bestMatch = similarCases[0];
      if (!bestMatch || !bestMatch.response_text.trim()) {
        showError("No similar solved case is ready to compare yet");
        return;
      }

      setCompareCase(bestMatch);
      void logEvent("workspace_compare_last_resolution_opened", {
        ticket_id: currentTicketId,
        similar_case_id: bestMatch.draft_id,
      });
    }, [response, similarCases, showError, logEvent, currentTicketId]);

    const handleApplyTemplate = useCallback((content: string) => {
      setResponse(content);
    }, []);

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
          showSuccess("Response saved as template");
          return true;
        }
        showError("Failed to save template");
        return false;
      },
      [
        saveAsTemplate,
        savedDraftId,
        templateModalRating,
        showSuccess,
        showError,
      ],
    );

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

    // Find similar saved responses when input changes
    useEffect(() => {
      if (input.trim().length >= 10) {
        setSuggestionsDismissed(false);
        findSimilar(input);
      }
    }, [input, findSimilar]);

    // Load alternatives when draft is loaded/saved
    useEffect(() => {
      if (savedDraftId) {
        loadAlternatives(savedDraftId);
      }
    }, [savedDraftId, loadAlternatives]);

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
      setShowTemplateModal(false);
      setTemplateModalRating(undefined);
      setSuggestionsDismissed(false);
      setCaseIntake({
        ...parseCaseIntake(null),
        note_audience: workspacePersonalization.preferred_note_audience,
      });
      setSimilarCases([]);
      setSimilarCasesLoading(false);
      setCompareCase(null);
      setGuidedRunbookSession(null);
      setGuidedRunbookNote("");
      setRunbookSessionSourceScopeKey(null);
      setRunbookSessionTouched(false);
      setAutosaveDraftId(null);
      setPendingSimilarCaseOpen(null);
      setWorkspaceRunbookScopeKey(createWorkspaceRunbookScopeKey());
      resetGeneration();
    }, [workspacePersonalization.preferred_note_audience, resetGeneration]);

    const handleResponseChange = useCallback(
      (text: string) => {
        setResponse(text);
        setIsResponseEdited(text !== originalResponse);
      },
      [originalResponse],
    );

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

    const handleCancel = useCallback(async () => {
      await cancelGeneration();
      setGenerating(false);
      // Keep the streaming text that was generated so far
      if (streamingText) {
        setResponse(streamingText);
        setOriginalResponse(streamingText);
        setIsResponseEdited(false);
      }
    }, [cancelGeneration, streamingText]);

    useEffect(() => {
      if (viewMode !== "panels") {
        return;
      }
      const handleKeydown = (event: KeyboardEvent) => {
        if (!event.metaKey || event.altKey || event.ctrlKey) {
          return;
        }
        if (isEditableTarget(event.target)) {
          return;
        }

        if (event.key === "1") {
          event.preventDefault();
          handlePanelDensityModeChange("balanced");
        } else if (event.key === "2") {
          event.preventDefault();
          handlePanelDensityModeChange("focus-intake");
        } else if (event.key === "3") {
          event.preventDefault();
          handlePanelDensityModeChange("focus-response");
        }
      };

      window.addEventListener("keydown", handleKeydown);
      return () => window.removeEventListener("keydown", handleKeydown);
    }, [viewMode, handlePanelDensityModeChange]);

    useEffect(() => {
      if (!similarCasesEnabled) {
        return;
      }

      const query = [
        input,
        caseIntake.issue,
        caseIntake.symptoms,
        currentTicket?.summary,
      ]
        .filter((value): value is string => Boolean(value?.trim()))
        .join(" ");
      if (!query.trim()) {
        setSimilarCases([]);
        return;
      }

      const timer = window.setTimeout(() => {
        void handleRefreshSimilarCases();
      }, 350);

      return () => window.clearTimeout(timer);
    }, [
      similarCasesEnabled,
      input,
      caseIntake.issue,
      caseIntake.symptoms,
      currentTicket?.summary,
      handleRefreshSimilarCases,
    ]);

    const buildDiagnosisJson = useCallback(() => {
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
        approvalQuery.trim() ||
        approvalSummary.trim() ||
        approvalSources.length > 0
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
    }, [
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
    ]);

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

    const handleSaveCurrentResolutionKit = useCallback(async () => {
      try {
        const nextKit = buildResolutionKitFromWorkspace({
          intake: caseIntake,
          kbDraft,
          responseText: response,
          sources,
        });
        await saveResolutionKit({
          ...nextKit,
          response_template: nextKit.response_template,
          checklist_items: nextKit.checklist_items,
          kb_document_ids: nextKit.kb_document_ids,
        });
        await refreshWorkspaceCatalog();
        void logEvent("workspace_resolution_kit_saved", {
          ticket_id: currentTicketId,
          category: nextKit.category,
        });
        showSuccess("Saved the current workspace as a resolution kit");
      } catch {
        showError("Failed to save resolution kit");
      }
    }, [
      caseIntake,
      kbDraft,
      response,
      sources,
      saveResolutionKit,
      refreshWorkspaceCatalog,
      logEvent,
      currentTicketId,
      showSuccess,
      showError,
    ]);

    const handleApplyResolutionKit = useCallback(
      (kit: ResolutionKit) => {
        const applied = applyResolutionKit({
          currentInput: input,
          currentResponse: response,
          currentIntake: caseIntake,
          kit,
        });
        setResponse(applied.responseText);
        if (!response.trim() && applied.responseText) {
          setOriginalResponse(applied.responseText);
          setIsResponseEdited(false);
        }
        setCaseIntake(applied.intake);
        setDiagnosticNotes((prev) =>
          compactLines([prev, applied.checklistText]),
        );
        setPanelDensityMode("focus-intake");
        void logEvent("workspace_resolution_kit_applied", {
          ticket_id: currentTicketId,
          kit_id: kit.id,
          category: kit.category,
        });
        showSuccess(`Applied ${kit.name}`);
      },
      [input, response, caseIntake, logEvent, currentTicketId, showSuccess],
    );

    const handleToggleWorkspaceFavorite = useCallback(
      async (
        kind: WorkspaceFavorite["kind"],
        resourceId: string,
        label: string,
        metadata?: Record<string, string> | null,
      ) => {
        try {
          const existing = workspaceFavorites.find(
            (favorite) =>
              favorite.kind === kind && favorite.resource_id === resourceId,
          );
          if (existing) {
            await deleteWorkspaceFavorite(existing.id);
            showSuccess(`Removed ${label} from favorites`);
          } else {
            await saveWorkspaceFavorite({
              kind,
              label,
              resource_id: resourceId,
              metadata: metadata ?? null,
            });
            showSuccess(`Added ${label} to favorites`);
          }
          await refreshWorkspaceCatalog();
          void logEvent("workspace_favorite_toggled", {
            ticket_id: currentTicketId,
            kind,
            resource_id: resourceId,
          });
        } catch {
          showError("Failed to update favorites");
        }
      },
      [
        workspaceFavorites,
        deleteWorkspaceFavorite,
        saveWorkspaceFavorite,
        refreshWorkspaceCatalog,
        showSuccess,
        logEvent,
        currentTicketId,
        showError,
      ],
    );

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
        showError,
        showSuccess,
      ],
    );

    const handleCompareSimilarCase = useCallback(
      (similarCase: SimilarCase) => {
        if (!response.trim()) {
          showError(
            "Generate or paste a response before comparing it to a prior resolution",
          );
          return;
        }
        setCompareCase(similarCase);
      },
      [response, showError],
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

    const handleSaveDraft = useCallback(async () => {
      if (!hasSaveableWorkspaceContent) {
        showError("Cannot save empty draft");
        return null;
      }

      const diagnosisData = buildDiagnosisJson();
      const currentCreatedAt = savedDraftCreatedAt ?? new Date().toISOString();
      const draftPayload = {
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
        status: "draft" as const,
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
          showSuccess("Draft saved");
        } else {
          showError(
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
      showError,
      showSuccess,
      sources,
      updateDraft,
      workspaceRunbookScopeKey,
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
          showSuccess(
            mode === "save-and-open"
              ? "Saved the current workspace and opened the saved case"
              : "Opened the saved case in the workspace",
          );
        } catch {
          showError("Failed to open the saved case");
        }
      },
      [
        currentTicketId,
        handleSaveDraft,
        loadSimilarCaseIntoWorkspace,
        logEvent,
        pendingSimilarCaseOpen,
        showError,
        showSuccess,
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
          showSuccess(
            mode === "save-and-open"
              ? "Saved the current workspace and opened the selected draft"
              : "Opened the selected draft in the workspace",
          );
        } catch {
          showError("Failed to open the selected draft");
        }
      },
      [
        applyLoadedDraft,
        handleSaveDraft,
        pendingDraftOpen,
        showError,
        showSuccess,
      ],
    );

    // Load initial draft if provided
    useEffect(() => {
      if (initialDraft) {
        handleLoadDraft(initialDraft);
      }
    }, [initialDraft, handleLoadDraft]);

    // Load templates on mount
    useEffect(() => {
      loadTemplates();
    }, [loadTemplates]);

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
            showError("Copy cancelled (reason required).");
            return;
          }
          await invoke("audit_response_copy_override", {
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
        showSuccess("Response copied to clipboard");
      } catch {
        showError("Failed to copy response");
      }
    }, [
      response,
      confidence?.mode,
      sources.length,
      showSuccess,
      showError,
      logEvent,
      savedDraftId,
      isResponseEdited,
      originalResponse,
      setHandoffTouched,
    ]);

    const handleExportResponse = useCallback(async () => {
      if (!response) {
        showError("No response to export");
        return;
      }
      try {
        const saved = await invoke<boolean>("export_draft", {
          responseText: response,
          format: "Markdown",
        });
        if (saved) {
          setHandoffTouched(true);
          showSuccess("Response exported successfully");
        }
      } catch (e) {
        showError(`Export failed: ${e}`);
      }
    }, [response, showSuccess, showError, setHandoffTouched]);

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
        intake={caseIntake}
        onIntakeChange={handleIntakeFieldChange}
        onAnalyzeIntake={handleAnalyzeIntake}
        onApplyIntakePreset={handleApplyIntakePreset}
        onNoteAudienceChange={handleNoteAudienceChange}
        nextActions={nextActions}
        missingQuestions={missingQuestions}
        onAcceptNextAction={handleAcceptNextAction}
        similarCases={similarCases}
        similarCasesLoading={similarCasesLoading}
        onRefreshSimilarCases={handleRefreshSimilarCases}
        onOpenSimilarCase={handleOpenSimilarCase}
        onCompareSimilarCase={handleCompareSimilarCase}
        onCompareLastResolution={handleCompareLastResolution}
        compareCase={compareCase}
        onCloseCompareCase={() => setCompareCase(null)}
        handoffPack={handoffPack}
        evidencePack={evidencePack}
        kbDraft={kbDraft}
        onCopyHandoffPack={handleCopyHandoffPack}
        onCopyEvidencePack={handleCopyEvidencePack}
        onCopyKbDraft={handleCopyKbDraft}
        resolutionKits={resolutionKits}
        onSaveResolutionKit={handleSaveCurrentResolutionKit}
        onApplyResolutionKit={handleApplyResolutionKit}
        favorites={workspaceFavorites}
        onToggleFavorite={handleToggleWorkspaceFavorite}
        runbookTemplates={runbookTemplates}
        guidedRunbookSession={guidedRunbookSession}
        runbookNote={guidedRunbookNote}
        onRunbookNoteChange={handleGuidedRunbookNoteChange}
        onStartGuidedRunbook={handleStartGuidedRunbook}
        onAdvanceGuidedRunbook={handleAdvanceGuidedRunbook}
        onCopyRunbookProgressToNotes={handleCopyRunbookProgressToNotes}
        workspacePersonalization={workspacePersonalization}
        onPersonalizationChange={handleWorkspacePersonalizationChange}
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
