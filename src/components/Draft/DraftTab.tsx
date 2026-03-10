import { useState, useCallback, useEffect, forwardRef, useImperativeHandle, useRef, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '../shared/Button';
import { Dialog } from '../shared/Dialog';
import { InputPanel } from './InputPanel';
import { DiagnosisPanel, TreeResult } from './DiagnosisPanel';
import { ResponsePanel } from './ResponsePanel';
import { AlternativePanel } from './AlternativePanel';
import { SaveAsTemplateModal } from './SaveAsTemplateModal';
import { SavedResponsesSuggestion } from './SavedResponsesSuggestion';
import { ConversationThread, ConversationEntry } from './ConversationThread';
import { ConversationInput } from './ConversationInput';
import { useLlm } from '../../hooks/useLlm';
import { useDrafts } from '../../hooks/useDrafts';
import { useKb } from '../../hooks/useKb';
import { useAnalytics } from '../../hooks/useAnalytics';
import { useAlternatives } from '../../hooks/useAlternatives';
import { useSavedResponses } from '../../hooks/useSavedResponses';
import { useMemoryKernelEnrichment } from '../../hooks/useMemoryKernelEnrichment';
import { useFeatureOps } from '../../hooks/useFeatureOps';
import { useToastContext } from '../../contexts/ToastContext';
import { useAppStatus } from '../../contexts/AppStatusContext';
import { AiReadinessBanner } from './AiReadinessBanner';
import { resolveRevampFlags } from '../../features/revamp';
import { TicketWorkspaceRail } from '../../features/workspace/TicketWorkspaceRail';
import {
  WORKSPACE_ANALYZE_INTAKE_EVENT,
  WORKSPACE_COMPARE_LAST_RESOLUTION_EVENT,
  WORKSPACE_COPY_EVIDENCE_EVENT,
  WORKSPACE_COPY_HANDOFF_EVENT,
  WORKSPACE_COPY_KB_DRAFT_EVENT,
  WORKSPACE_REFRESH_SIMILAR_CASES_EVENT,
} from '../../features/workspace/workspaceEvents';
import {
  applyResolutionKit,
  analyzeCaseIntake,
  buildEvidencePack,
  buildHandoffPack,
  buildKbDraft,
  buildMissingQuestions,
  buildNextActions,
  buildResolutionKitFromWorkspace,
  buildSimilarCases,
  compactLines,
  formatEvidencePackForClipboard,
  formatHandoffPackForClipboard,
  formatKbDraftForClipboard,
  parseCaseIntake,
  toGuidedRunbookSession,
  toGuidedRunbookTemplate,
  toResolutionKit,
  toWorkspaceFavorite,
  serializeCaseIntake,
} from '../../features/workspace/workspaceAssistant';
import {
  hasMeaningfulWorkspaceDraftContent,
  resolveWorkspaceAutosaveState,
  shouldProceedAfterSaveAttempt,
} from '../../features/workspace/workspaceDraftSession';
import { calculateEditRatio, countWords } from '../../features/analytics/qualityMetrics';
import type { JiraTicket } from '../../hooks/useJira';
import type {
  CaseIntake,
  ContextSource,
  ConfidenceAssessment,
  EvidencePack,
  GenerationMetrics,
  GuidedRunbookSession,
  GuidedRunbookTemplate,
  GroundedClaim,
  KbDraft,
  MissingQuestion,
  NextActionRecommendation,
  NoteAudience,
  ResponseLength,
  ResolutionKit,
  SavedDraft,
  ChecklistItem,
  ChecklistState,
  FirstResponseTone,
  SearchResult,
  SimilarCase,
  WorkspaceFavorite,
  WorkspacePersonalization,
} from '../../types';
import './DraftTab.css';

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

type DraftPanelDensityMode = 'balanced' | 'focus-intake' | 'focus-response';

const DRAFT_PANEL_DENSITY_STORAGE_KEY = 'draft-panel-density-mode';
const WORKSPACE_PERSONALIZATION_STORAGE_KEY = 'assistsupport.workspace.personalization.v1';

const DEFAULT_WORKSPACE_PERSONALIZATION: WorkspacePersonalization = {
  preferred_note_audience: 'internal-note',
  preferred_output_length: 'Medium',
  favorite_queue_view: 'all',
  default_evidence_format: 'clipboard',
};

const DEFAULT_RUNBOOK_TEMPLATES: Array<Omit<GuidedRunbookTemplate, 'id'>> = [
  {
    name: 'Security Incident',
    scenario: 'security-incident',
    steps: ['Acknowledge the incident', 'Confirm scope and impacted users', 'Contain access or affected systems', 'Notify stakeholders', 'Prepare escalation or recovery note'],
  },
  {
    name: 'Access Request Review',
    scenario: 'access-request',
    steps: ['Confirm requester identity', 'Check policy or entitlement path', 'Verify required approver', 'Document evidence and approval state', 'Communicate approved or denied outcome'],
  },
  {
    name: 'Device Troubleshooting',
    scenario: 'device-troubleshooting',
    steps: ['Capture symptoms and environment', 'Verify recent changes', 'Run standard checks or reboot path', 'Collect logs or screenshots', 'Escalate with evidence if unresolved'],
  },
];

function loadWorkspacePersonalization(): WorkspacePersonalization {
  if (typeof window === 'undefined') {
    return DEFAULT_WORKSPACE_PERSONALIZATION;
  }

  try {
    const raw = window.localStorage.getItem(WORKSPACE_PERSONALIZATION_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_WORKSPACE_PERSONALIZATION;
    }

    const parsed = JSON.parse(raw) as Partial<WorkspacePersonalization>;
    return {
      preferred_note_audience: parsed.preferred_note_audience ?? DEFAULT_WORKSPACE_PERSONALIZATION.preferred_note_audience,
      preferred_output_length: parsed.preferred_output_length ?? DEFAULT_WORKSPACE_PERSONALIZATION.preferred_output_length,
      favorite_queue_view: parsed.favorite_queue_view ?? DEFAULT_WORKSPACE_PERSONALIZATION.favorite_queue_view,
      default_evidence_format: parsed.default_evidence_format ?? DEFAULT_WORKSPACE_PERSONALIZATION.default_evidence_format,
    };
  } catch {
    return DEFAULT_WORKSPACE_PERSONALIZATION;
  }
}

function createWorkspaceScopeSeed(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
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
    tag === 'input' ||
    tag === 'textarea' ||
    tag === 'select' ||
    target.isContentEditable
  );
}

const INTAKE_PRESETS: Record<'incident' | 'access' | 'rollout' | 'device', Partial<CaseIntake>> = {
  incident: {
    likely_category: 'incident',
    urgency: 'high',
    note_audience: 'internal-note',
  },
  access: {
    likely_category: 'access',
    urgency: 'normal',
    note_audience: 'internal-note',
  },
  rollout: {
    likely_category: 'change-rollout',
    urgency: 'normal',
    note_audience: 'internal-note',
  },
  device: {
    likely_category: 'device-environment',
    urgency: 'normal',
    note_audience: 'internal-note',
  },
};

export const DraftTab = forwardRef<DraftTabHandle, DraftTabProps>(function DraftTab(
  { initialDraft, onNavigateToSource, revampModeEnabled = false },
  ref
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
    listRunbookStepEvidence,
    addRunbookStepEvidence,
    saveCaseOutcome,
  } = useFeatureOps();
  const appStatus = useAppStatus();
  const workspaceFlags = useMemo(() => resolveRevampFlags(), []);
  const workspaceRailEnabled = revampModeEnabled && workspaceFlags.ASSISTSUPPORT_TICKET_WORKSPACE_V2;
  const structuredIntakeEnabled = workspaceRailEnabled && workspaceFlags.ASSISTSUPPORT_STRUCTURED_INTAKE;
  const similarCasesEnabled = workspaceRailEnabled && workspaceFlags.ASSISTSUPPORT_SIMILAR_CASES;
  const nextBestActionEnabled = workspaceRailEnabled && workspaceFlags.ASSISTSUPPORT_NEXT_BEST_ACTION;

  // Use centralized model status from AppStatusContext
  const modelLoaded = appStatus.llmLoaded;
  const loadedModelName = appStatus.llmModelName;

  const [input, setInput] = useState('');
  const [ocrText, setOcrText] = useState<string | null>(null);
  const [diagnosticNotes, setDiagnosticNotes] = useState('');
  const [treeResult, setTreeResult] = useState<TreeResult | null>(null);
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [checklistCompleted, setChecklistCompleted] = useState<Record<string, boolean>>({});
  const [checklistGenerating, setChecklistGenerating] = useState(false);
  const [checklistUpdating, setChecklistUpdating] = useState(false);
  const [checklistError, setChecklistError] = useState<string | null>(null);
  const [firstResponse, setFirstResponse] = useState('');
  const [firstResponseTone, setFirstResponseTone] = useState<FirstResponseTone>('slack');
  const [firstResponseGenerating, setFirstResponseGenerating] = useState(false);
  const [approvalQuery, setApprovalQuery] = useState('');
  const [approvalResults, setApprovalResults] = useState<SearchResult[]>([]);
  const [approvalSearching, setApprovalSearching] = useState(false);
  const [approvalSummary, setApprovalSummary] = useState('');
  const [approvalSummarizing, setApprovalSummarizing] = useState(false);
  const [approvalSources, setApprovalSources] = useState<ContextSource[]>([]);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [response, setResponse] = useState('');
  const [sources, setSources] = useState<ContextSource[]>([]);
  const [metrics, setMetrics] = useState<GenerationMetrics | null>(null);
  const [confidence, setConfidence] = useState<ConfidenceAssessment | null>(null);
  const [grounding, setGrounding] = useState<GroundedClaim[]>([]);
  const [workspacePersonalization, setWorkspacePersonalization] = useState<WorkspacePersonalization>(loadWorkspacePersonalization);
  const [responseLength, setResponseLength] = useState<ResponseLength>(() => loadWorkspacePersonalization().preferred_output_length);
  const [diagnosisCollapsed, setDiagnosisCollapsed] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [currentTicketId, setCurrentTicketId] = useState<string | null>(null);
  const [currentTicket, setCurrentTicket] = useState<JiraTicket | null>(null);
  const [originalResponse, setOriginalResponse] = useState<string>('');
  const [isResponseEdited, setIsResponseEdited] = useState(false);
  const [savedDraftId, setSavedDraftId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'panels' | 'conversation'>(() => {
    return (localStorage.getItem('draft-view-mode') as 'panels' | 'conversation') || 'panels';
  });
  const [panelDensityMode, setPanelDensityMode] = useState<DraftPanelDensityMode>(() => {
    const stored = localStorage.getItem(DRAFT_PANEL_DENSITY_STORAGE_KEY);
    if (stored === 'balanced' || stored === 'focus-intake' || stored === 'focus-response') {
      return stored;
    }
    return 'balanced';
  });
  const [conversationEntries, setConversationEntries] = useState<ConversationEntry[]>([]);
  const [handoffTouched, setHandoffTouched] = useState(false);
  const [caseIntake, setCaseIntake] = useState<CaseIntake>(() => ({
    ...parseCaseIntake(null),
    note_audience: loadWorkspacePersonalization().preferred_note_audience,
  }));
  const [similarCases, setSimilarCases] = useState<SimilarCase[]>([]);
  const [similarCasesLoading, setSimilarCasesLoading] = useState(false);
  const [compareCase, setCompareCase] = useState<SimilarCase | null>(null);
  const [resolutionKits, setResolutionKits] = useState<ResolutionKit[]>([]);
  const [workspaceFavorites, setWorkspaceFavorites] = useState<WorkspaceFavorite[]>([]);
  const [runbookTemplates, setRunbookTemplates] = useState<GuidedRunbookTemplate[]>([]);
  const [guidedRunbookSession, setGuidedRunbookSession] = useState<GuidedRunbookSession | null>(null);
  const [guidedRunbookNote, setGuidedRunbookNote] = useState('');
  const [workspaceCatalogLoading, setWorkspaceCatalogLoading] = useState(false);
  const [workspaceRunbookScopeKey, setWorkspaceRunbookScopeKey] = useState<string>(createWorkspaceRunbookScopeKey);
  const [autosaveDraftId, setAutosaveDraftId] = useState<string | null>(null);
  const [pendingSimilarCaseOpen, setPendingSimilarCaseOpen] = useState<SimilarCase | null>(null);

  // Alternatives & saved responses
  const { alternatives, loadAlternatives, saveAlternative, chooseAlternative } = useAlternatives();
  const { suggestions, findSimilar, saveAsTemplate, incrementUsage } = useSavedResponses();
  const [generatingAlternative, setGeneratingAlternative] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templateModalRating, setTemplateModalRating] = useState<number | undefined>(undefined);
  const [suggestionsDismissed, setSuggestionsDismissed] = useState(false);
  const firstDraftStartMsRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(
      WORKSPACE_PERSONALIZATION_STORAGE_KEY,
      JSON.stringify(workspacePersonalization),
    );
  }, [workspacePersonalization]);

  const refreshWorkspaceCatalog = useCallback(async () => {
    if (!workspaceRailEnabled) {
      setResolutionKits([]);
      setWorkspaceFavorites([]);
      setRunbookTemplates([]);
      setGuidedRunbookSession(null);
      return;
    }

    setWorkspaceCatalogLoading(true);
    try {
      const [kitRecords, favoriteRecords, templateRecords, sessionRecords] = await Promise.all([
        listResolutionKits(20).catch(() => []),
        listWorkspaceFavorites().catch(() => []),
        listRunbookTemplates(20).catch(() => []),
        listRunbookSessions(20, undefined, workspaceRunbookScopeKey).catch(() => []),
      ]);

      let nextTemplateRecords = templateRecords;
      if (workspaceFlags.ASSISTSUPPORT_GUIDED_RUNBOOKS_V2 && nextTemplateRecords.length === 0) {
        await Promise.all(
          DEFAULT_RUNBOOK_TEMPLATES.map((template) =>
            saveRunbookTemplate({
              name: template.name,
              scenario: template.scenario,
              steps_json: JSON.stringify(template.steps),
            }),
          ),
        ).catch(() => undefined);
        nextTemplateRecords = await listRunbookTemplates(20).catch(() => []);
      }

      setResolutionKits(kitRecords.map(toResolutionKit));
      setWorkspaceFavorites(favoriteRecords.map(toWorkspaceFavorite));
      setRunbookTemplates(nextTemplateRecords.map(toGuidedRunbookTemplate));

      const legacySessionRecords = sessionRecords.length === 0
        ? await listRunbookSessions(20, undefined, 'legacy:unscoped').catch(() => [])
        : [];
      const visibleSessionRecords = sessionRecords.length > 0 ? sessionRecords : legacySessionRecords;

      const activeSessionRecord = visibleSessionRecords.find((session) => session.status === 'active' || session.status === 'paused')
        ?? visibleSessionRecords[0]
        ?? null;

      if (!activeSessionRecord) {
        setGuidedRunbookSession(null);
        return;
      }

      const evidenceRecords = await listRunbookStepEvidence(activeSessionRecord.id).catch(() => []);
      setGuidedRunbookSession(toGuidedRunbookSession(activeSessionRecord, evidenceRecords));
    } finally {
      setWorkspaceCatalogLoading(false);
    }
  }, [
    workspaceRailEnabled,
    workspaceFlags.ASSISTSUPPORT_GUIDED_RUNBOOKS_V2,
    listResolutionKits,
    listWorkspaceFavorites,
    listRunbookTemplates,
    listRunbookSessions,
    listRunbookStepEvidence,
    saveRunbookTemplate,
    workspaceRunbookScopeKey,
  ]);

  useEffect(() => {
    void refreshWorkspaceCatalog();
  }, [refreshWorkspaceCatalog]);

  const handleIntakeFieldChange = useCallback((field: keyof CaseIntake, value: string) => {
    setCaseIntake((prev) => ({
      ...prev,
      [field]: value,
    }));
  }, []);

  const handleAnalyzeIntake = useCallback(() => {
    setCaseIntake((prev) => analyzeCaseIntake(input, currentTicket ?? undefined, prev));
    void logEvent('workspace_intake_analyzed', {
      ticket_id: currentTicketId,
      has_ticket: Boolean(currentTicketId),
      has_response: Boolean(response.trim()),
    });
  }, [input, currentTicket, logEvent, currentTicketId, response]);

  const handleApplyIntakePreset = useCallback((preset: 'incident' | 'access' | 'rollout' | 'device') => {
    setCaseIntake((prev) => ({
      ...prev,
      ...INTAKE_PRESETS[preset],
    }));
    void logEvent('workspace_intake_preset_applied', { preset });
  }, [logEvent]);

  const handleNoteAudienceChange = useCallback((audience: NoteAudience) => {
    setCaseIntake((prev) => ({
      ...prev,
      note_audience: audience,
    }));
    setWorkspacePersonalization((prev) => ({
      ...prev,
      preferred_note_audience: audience,
    }));
    void logEvent('workspace_note_audience_changed', { audience });
  }, [logEvent]);

  const handleResponseLengthChange = useCallback((length: ResponseLength) => {
    setResponseLength(length);
    setWorkspacePersonalization((prev) => ({
      ...prev,
      preferred_output_length: length,
    }));
  }, []);

  const handleWorkspacePersonalizationChange = useCallback((patch: Partial<WorkspacePersonalization>) => {
    setWorkspacePersonalization((prev) => {
      const next = { ...prev, ...patch };
      if (patch.preferred_note_audience && !savedDraftId) {
        setCaseIntake((current) => ({
          ...current,
          note_audience: current.note_audience ?? patch.preferred_note_audience ?? next.preferred_note_audience,
        }));
      }
      if (patch.preferred_output_length) {
        setResponseLength(patch.preferred_output_length);
      }
      return next;
    });
  }, [savedDraftId]);

  const handleRefreshSimilarCases = useCallback(async () => {
    if (!similarCasesEnabled) {
      setSimilarCases([]);
      return;
    }

    const query = [input, currentTicket?.summary, caseIntake.issue, caseIntake.symptoms]
      .filter((value): value is string => Boolean(value?.trim()))
      .join(' ');

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
  }, [similarCasesEnabled, input, currentTicket?.summary, caseIntake.issue, caseIntake.symptoms, searchDrafts, savedDraftId]);

  const handleCompareLastResolution = useCallback(() => {
    if (!response.trim()) {
      showError('Generate or paste a response before comparing it to a prior resolution');
      return;
    }

    const bestMatch = similarCases[0];
    if (!bestMatch || !bestMatch.response_text.trim()) {
      showError('No similar solved case is ready to compare yet');
      return;
    }

    setCompareCase(bestMatch);
    void logEvent('workspace_compare_last_resolution_opened', {
      ticket_id: currentTicketId,
      similar_case_id: bestMatch.draft_id,
    });
  }, [response, similarCases, showError, logEvent, currentTicketId]);

  const handleGenerate = useCallback(async () => {
    if (!input.trim() || generating) return;

    if (!modelLoaded) {
      showError('No model loaded. Go to Settings to load a model.');
      return;
    }

    setGenerating(true);
    if (firstDraftStartMsRef.current === null) {
      firstDraftStartMsRef.current = Date.now();
    }
    setResponse(''); // Clear previous response
    clearStreamingText(); // Clear streaming buffer
    setConfidence(null);
    setGrounding([]);
    try {
      const combinedInput = ocrText ? `${input}\n\n[Screenshot OCR Text]:\n${ocrText}` : input;
      const enrichment = await enrichDiagnosticNotes(combinedInput, diagnosticNotes || undefined);
      logEvent('memorykernel_enrichment_attempted', {
        applied: enrichment.enrichmentApplied,
        status: enrichment.status,
        fallback_reason: enrichment.fallbackReason,
        machine_error_code: enrichment.machineErrorCode,
      });
      if (!enrichment.enrichmentApplied) {
        console.info('MemoryKernel enrichment skipped:', enrichment.message);
      }

      // Build tree decisions if available
      const treeDecisions = treeResult ? {
        tree_name: treeResult.treeName,
        path_summary: treeResult.pathSummary,
      } : undefined;

      const result = await generateStreaming(combinedInput, responseLength, {
        treeDecisions,
        diagnosticNotes: enrichment.diagnosticNotes,
        jiraTicket: currentTicket || undefined,
      });
      setResponse(result.text);
      setOriginalResponse(result.text);
      setIsResponseEdited(false);
      setSources(result.sources);
      setMetrics(result.metrics ?? null);
      setConfidence(result.confidence ?? null);
      setGrounding(result.grounding ?? []);
      const responseWordCount = countWords(result.text);
      const timeToDraftMs = firstDraftStartMsRef.current ? Date.now() - firstDraftStartMsRef.current : null;
      logEvent('response_generated', {
        response_length: responseLength,
        tokens_generated: result.tokens_generated,
        duration_ms: result.duration_ms,
        sources_count: result.sources.length,
      });
      logEvent('response_quality_snapshot', {
        draft_id: savedDraftId,
        word_count: responseWordCount,
        edit_ratio: 0,
        time_to_draft_ms: timeToDraftMs,
        has_ticket: !!currentTicketId,
        has_tree_path: !!treeResult,
        has_notes: !!enrichment.diagnosticNotes?.trim(),
      });
    } catch (e) {
      console.error('Generation failed:', e);
      showError(`Generation failed: ${e}`);
    } finally {
      setGenerating(false);
    }
  }, [input, ocrText, responseLength, generating, modelLoaded, treeResult, diagnosticNotes, currentTicket, generateStreaming, clearStreamingText, showError, logEvent, enrichDiagnosticNotes, savedDraftId, currentTicketId]);

  const handleGenerateFirstResponse = useCallback(async () => {
    if (firstResponseGenerating) return;

    if (!modelLoaded) {
      showError('No model loaded. Go to Settings to load a model.');
      return;
    }

    const ticketFallback = currentTicket
      ? `${currentTicket.summary}${currentTicket.description ? `\n\n${currentTicket.description}` : ''}`
      : '';
    const promptInput = input.trim() || ticketFallback.trim() || ocrText?.trim() || '';
    if (!promptInput) {
      showError('Add ticket details or notes before generating a first response.');
      return;
    }

    setFirstResponseGenerating(true);
    try {
      const result = await generateFirstResponse({
        user_input: promptInput,
        tone: firstResponseTone,
        ocr_text: ocrText ?? undefined,
        jira_ticket: currentTicket ?? undefined,
      });
      setFirstResponse(result.text);
    } catch (e) {
      console.error('First response generation failed:', e);
      showError(`First response failed: ${e}`);
    } finally {
      setFirstResponseGenerating(false);
    }
  }, [input, firstResponseGenerating, modelLoaded, generateFirstResponse, firstResponseTone, ocrText, currentTicket, showError]);

  const handleCopyFirstResponse = useCallback(async () => {
    if (!firstResponse.trim()) return;
    try {
      await navigator.clipboard.writeText(firstResponse);
      showSuccess('First response copied to clipboard');
    } catch (e) {
      showError('Failed to copy first response');
    }
  }, [firstResponse, showSuccess, showError]);

  const handleClearFirstResponse = useCallback(() => {
    setFirstResponse('');
  }, []);

  const handleChecklistGenerate = useCallback(async () => {
    if (checklistGenerating) return;

    if (!modelLoaded) {
      showError('No model loaded. Go to Settings to load a model.');
      return;
    }

    const ticketFallback = currentTicket
      ? `${currentTicket.summary}${currentTicket.description ? `\n\n${currentTicket.description}` : ''}`
      : '';
    const promptInput = input.trim() || ticketFallback.trim() || ocrText?.trim() || '';
    if (!promptInput) {
      setChecklistError('Add ticket details or notes before generating a checklist.');
      return;
    }

    setChecklistGenerating(true);
    setChecklistError(null);
    try {
      const treeDecisions = treeResult ? {
        tree_name: treeResult.treeName,
        path_summary: treeResult.pathSummary,
      } : undefined;

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
      console.error('Checklist generation failed:', e);
      setChecklistError(`Checklist failed: ${e}`);
    } finally {
      setChecklistGenerating(false);
    }
  }, [input, checklistGenerating, modelLoaded, treeResult, ocrText, diagnosticNotes, currentTicket, generateChecklist, showError]);

  const handleChecklistUpdate = useCallback(async () => {
    if (!checklistItems.length || checklistUpdating) return;

    if (!modelLoaded) {
      showError('No model loaded. Go to Settings to load a model.');
      return;
    }

    const ticketFallback = currentTicket
      ? `${currentTicket.summary}${currentTicket.description ? `\n\n${currentTicket.description}` : ''}`
      : '';
    const promptInput = input.trim() || ticketFallback.trim() || ocrText?.trim() || '';
    if (!promptInput) {
      setChecklistError('Add ticket details or notes before updating the checklist.');
      return;
    }

    setChecklistUpdating(true);
    setChecklistError(null);
    try {
      const treeDecisions = treeResult ? {
        tree_name: treeResult.treeName,
        path_summary: treeResult.pathSummary,
      } : undefined;

      const completedIds = Object.keys(checklistCompleted).filter(id => checklistCompleted[id]);
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
      console.error('Checklist update failed:', e);
      setChecklistError(`Checklist update failed: ${e}`);
    } finally {
      setChecklistUpdating(false);
    }
  }, [checklistItems, checklistUpdating, modelLoaded, input, ocrText, diagnosticNotes, treeResult, currentTicket, checklistCompleted, updateChecklist, showError]);

  const handleChecklistToggle = useCallback((id: string) => {
    setChecklistCompleted(prev => ({
      ...prev,
      [id]: !prev[id],
    }));
  }, []);

  const handleChecklistClear = useCallback(() => {
    setChecklistItems([]);
    setChecklistCompleted({});
    setChecklistError(null);
  }, []);

  const handleApprovalSearch = useCallback(async () => {
    if (!approvalQuery.trim()) {
      setApprovalError('Enter a search term to look up approvals.');
      return;
    }

    setApprovalSearching(true);
    setApprovalError(null);
    try {
      const results = await searchKb(approvalQuery.trim(), 5);
      setApprovalResults(results);
    } catch (e) {
      console.error('Approval search failed:', e);
      setApprovalError('Approval search failed.');
    } finally {
      setApprovalSearching(false);
    }
  }, [approvalQuery, searchKb]);

  const handleApprovalSummarize = useCallback(async () => {
    if (!approvalQuery.trim()) {
      setApprovalError('Enter a search term to summarize approvals.');
      return;
    }

    if (!modelLoaded) {
      showError('No model loaded. Go to Settings to load a model.');
      return;
    }

    setApprovalSummarizing(true);
    setApprovalError(null);
    try {
      const prompt = `Summarize the approval steps and owner(s) for: ${approvalQuery.trim()}. Keep it concise. If sources do not mention it, say so.`;
      const result = await generateWithContextParams({
        user_input: prompt,
        kb_limit: 5,
        response_length: 'Short',
      });

      setApprovalSummary(result.text);
      setApprovalSources(result.sources);
    } catch (e) {
      console.error('Approval summary failed:', e);
      setApprovalError('Approval summary failed.');
    } finally {
      setApprovalSummarizing(false);
    }
  }, [approvalQuery, modelLoaded, generateWithContextParams, showError]);

  const handleApplyTemplate = useCallback((content: string) => {
    setResponse(content);
  }, []);

  const handleGenerateAlternative = useCallback(async () => {
    if (!response || generating || generatingAlternative || !modelLoaded) return;

    setGeneratingAlternative(true);
    try {
      const combinedInput = ocrText ? `${input}\n\n[Screenshot OCR Text]:\n${ocrText}` : input;
      const treeDecisions = treeResult ? {
        tree_name: treeResult.treeName,
        path_summary: treeResult.pathSummary,
      } : undefined;

      const result = await generateStreaming(combinedInput, responseLength, {
        treeDecisions,
        diagnosticNotes: diagnosticNotes || undefined,
        jiraTicket: currentTicket || undefined,
      });

      // Save the alternative
      if (savedDraftId) {
        await saveAlternative(savedDraftId, response, result.text, {
          sourcesJson: result.sources.length > 0 ? JSON.stringify(result.sources) : undefined,
          metricsJson: result.metrics ? JSON.stringify(result.metrics) : undefined,
        });
        await loadAlternatives(savedDraftId);
      }

      logEvent('alternative_generated', {
        draft_id: savedDraftId,
        tokens_generated: result.tokens_generated,
      });
    } catch (e) {
      console.error('Alternative generation failed:', e);
      showError(`Alternative generation failed: ${e}`);
    } finally {
      setGeneratingAlternative(false);
    }
  }, [response, generating, generatingAlternative, modelLoaded, input, ocrText, responseLength, treeResult, diagnosticNotes, currentTicket, generateStreaming, savedDraftId, saveAlternative, loadAlternatives, logEvent, showError]);

  const handleChooseAlternative = useCallback(async (alternativeId: string, choice: 'original' | 'alternative') => {
    await chooseAlternative(alternativeId, choice);
    if (savedDraftId) {
      await loadAlternatives(savedDraftId);
    }
  }, [chooseAlternative, loadAlternatives, savedDraftId]);

  const handleUseAlternative = useCallback((text: string) => {
    setResponse(text);
    setOriginalResponse(text);
    setIsResponseEdited(false);
  }, []);

  const handleSaveAsTemplate = useCallback((rating: number) => {
    setTemplateModalRating(rating);
    setShowTemplateModal(true);
  }, []);

  const handleTemplateModalSave = useCallback(async (
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
      showSuccess('Response saved as template');
      return true;
    }
    showError('Failed to save template');
    return false;
  }, [saveAsTemplate, savedDraftId, templateModalRating, showSuccess, showError]);

  const handleSuggestionApply = useCallback((content: string, templateId: string) => {
    setResponse(content);
    setOriginalResponse(content);
    setIsResponseEdited(false);
    incrementUsage(templateId);
    setSuggestionsDismissed(true);
  }, [incrementUsage]);

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
    setInput('');
    setOcrText(null);
    setDiagnosticNotes('');
    setTreeResult(null);
    setChecklistItems([]);
    setChecklistCompleted({});
    setChecklistError(null);
    setChecklistGenerating(false);
    setChecklistUpdating(false);
    setFirstResponse('');
    setFirstResponseTone('slack');
    setFirstResponseGenerating(false);
    setApprovalQuery('');
    setApprovalResults([]);
    setApprovalSummary('');
    setApprovalSources([]);
    setApprovalError(null);
    setApprovalSearching(false);
    setApprovalSummarizing(false);
    setResponse('');
    setOriginalResponse('');
    setIsResponseEdited(false);
    setSources([]);
    setMetrics(null);
    setConfidence(null);
    setGrounding([]);
    setCurrentTicketId(null);
    setCurrentTicket(null);
    setSavedDraftId(null);
    setConversationEntries([]);
    setHandoffTouched(false);
    setGeneratingAlternative(false);
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
    setGuidedRunbookNote('');
    setAutosaveDraftId(null);
    setPendingSimilarCaseOpen(null);
    setWorkspaceRunbookScopeKey(createWorkspaceRunbookScopeKey());
    firstDraftStartMsRef.current = null;
  }, [workspacePersonalization.preferred_note_audience]);

  const handleResponseChange = useCallback((text: string) => {
    setResponse(text);
    setIsResponseEdited(text !== originalResponse);
  }, [originalResponse]);

  const handleTreeComplete = useCallback((result: TreeResult) => {
    setTreeResult(result);
  }, []);

  const handleTreeClear = useCallback(() => {
    setTreeResult(null);
  }, []);

  const handleViewModeChange = useCallback((mode: 'panels' | 'conversation') => {
    setViewMode(mode);
    localStorage.setItem('draft-view-mode', mode);
  }, []);

  const handlePanelDensityModeChange = useCallback((mode: DraftPanelDensityMode) => {
    setPanelDensityMode(mode);
    localStorage.setItem(DRAFT_PANEL_DENSITY_STORAGE_KEY, mode);
  }, []);

  const handleConversationSubmit = useCallback(async (text: string) => {
    if (!modelLoaded) return;

    // Add input entry
    const inputEntry: ConversationEntry = {
      id: crypto.randomUUID(),
      type: 'input',
      timestamp: new Date().toISOString(),
      content: text,
    };
    setConversationEntries(prev => [...prev, inputEntry]);
    setInput(text);

    // Generate
    setGenerating(true);
    setResponse('');
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
        type: 'response',
        timestamp: new Date().toISOString(),
        content: result.text,
        sources: result.sources,
        metrics: result.metrics ? {
          tokens_per_second: result.metrics.tokens_per_second,
          sources_used: result.metrics.sources_used,
          word_count: result.metrics.word_count,
        } : undefined,
      };
      setConversationEntries(prev => [...prev, responseEntry]);
    } catch (e) {
      console.error('Generation failed:', e);
    } finally {
      setGenerating(false);
    }
  }, [modelLoaded, responseLength, generateStreaming, clearStreamingText]);

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
    if (viewMode !== 'panels') {
      return;
    }
    const handleKeydown = (event: KeyboardEvent) => {
      if (!event.metaKey || event.altKey || event.ctrlKey) {
        return;
      }
      if (isEditableTarget(event.target)) {
        return;
      }

      if (event.key === '1') {
        event.preventDefault();
        handlePanelDensityModeChange('balanced');
      } else if (event.key === '2') {
        event.preventDefault();
        handlePanelDensityModeChange('focus-intake');
      } else if (event.key === '3') {
        event.preventDefault();
        handlePanelDensityModeChange('focus-response');
      }
    };

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [viewMode, handlePanelDensityModeChange]);

  useEffect(() => {
    if (!similarCasesEnabled) {
      return;
    }

    const query = [input, caseIntake.issue, caseIntake.symptoms, currentTicket?.summary]
      .filter((value): value is string => Boolean(value?.trim()))
      .join(' ');
    if (!query.trim()) {
      setSimilarCases([]);
      return;
    }

    const timer = window.setTimeout(() => {
      void handleRefreshSimilarCases();
    }, 350);

    return () => window.clearTimeout(timer);
  }, [similarCasesEnabled, input, caseIntake.issue, caseIntake.symptoms, currentTicket?.summary, handleRefreshSimilarCases]);

  const handleLoadDraft = useCallback((draft: SavedDraft) => {
    setInput(draft.input_text);
    const loadedResponse = draft.response_text || '';
    setResponse(loadedResponse);
    setOriginalResponse(loadedResponse);
    setIsResponseEdited(false);
    setSavedDraftId(draft.id);
    setAutosaveDraftId(draft.is_autosave ? draft.id : null);
    setWorkspaceRunbookScopeKey(`draft:${draft.id}`);
    if (draft.diagnosis_json) {
      try {
        const diagData = JSON.parse(draft.diagnosis_json);
        setDiagnosticNotes(diagData.notes || '');
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
          setFirstResponseTone(firstResponseState.tone || 'slack');
        } else {
          setFirstResponse('');
          setFirstResponseTone('slack');
        }

        const approvalState = diagData.approval;
        if (approvalState) {
          setApprovalQuery(approvalState.query || '');
          setApprovalSummary(approvalState.summary || '');
          setApprovalSources(approvalState.sources || []);
        } else {
          setApprovalQuery('');
          setApprovalSummary('');
          setApprovalSources([]);
        }
        setApprovalResults([]);
        setApprovalError(null);

        const trustState = diagData.trust;
        setConfidence(trustState?.confidence || null);
        setGrounding(trustState?.grounding || []);
      } catch {
        setDiagnosticNotes('');
        setTreeResult(null);
        setChecklistItems([]);
        setChecklistCompleted({});
        setChecklistError(null);
        setFirstResponse('');
        setFirstResponseTone('slack');
        setApprovalQuery('');
        setApprovalSummary('');
        setApprovalSources([]);
        setApprovalResults([]);
        setApprovalError(null);
        setConfidence(null);
        setGrounding([]);
      }
    } else {
      setDiagnosticNotes('');
      setTreeResult(null);
      setChecklistItems([]);
      setChecklistCompleted({});
      setChecklistError(null);
      setFirstResponse('');
      setFirstResponseTone('slack');
      setApprovalQuery('');
      setApprovalSummary('');
      setApprovalSources([]);
      setApprovalResults([]);
      setApprovalError(null);
      setConfidence(null);
      setGrounding([]);
    }
    const draftTicketId = draft.ticket_id?.trim() || null;
    setCurrentTicketId(draftTicketId);
    if (draftTicketId) {
      void invoke<JiraTicket>('get_jira_ticket', { ticketKey: draftTicketId })
        .then((ticket) => setCurrentTicket(ticket))
        .catch(() => setCurrentTicket(null));
    } else {
      setCurrentTicket(null);
    }
    if (draft.kb_sources_json) {
      try {
        setSources(JSON.parse(draft.kb_sources_json));
      } catch {
        setSources([]);
      }
    } else {
      setSources([]);
    }
    const parsedIntake = parseCaseIntake(draft.case_intake_json);
    setCaseIntake({
      ...parsedIntake,
      note_audience: parsedIntake.note_audience ?? workspacePersonalization.preferred_note_audience,
    });
    setHandoffTouched(Boolean(draft.handoff_summary));
    setCompareCase(null);
    setGuidedRunbookSession(null);
    setGuidedRunbookNote('');
    setPendingSimilarCaseOpen(null);
    setOcrText(null);
  }, [workspacePersonalization.preferred_note_audience]);

  useEffect(() => {
    if (savedDraftId || !autosaveDraftId) {
      return;
    }

    const autosaveScopeKey = `draft:${autosaveDraftId}`;
    if (workspaceRunbookScopeKey === autosaveScopeKey) {
      return;
    }

    let cancelled = false;

    void reassignRunbookSessionScope(workspaceRunbookScopeKey, autosaveScopeKey)
      .then(() => {
        if (!cancelled) {
          setWorkspaceRunbookScopeKey(autosaveScopeKey);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [autosaveDraftId, reassignRunbookSessionScope, savedDraftId, workspaceRunbookScopeKey]);

  const buildDiagnosisJson = useCallback(() => {
    const completedIds = Object.keys(checklistCompleted).filter(id => checklistCompleted[id]);
    const checklistState = checklistItems.length > 0
      ? { items: checklistItems, completed_ids: completedIds }
      : null;
    const firstResponseState = firstResponse.trim()
      ? { text: firstResponse, tone: firstResponseTone }
      : null;
    const approvalState = (approvalQuery.trim() || approvalSummary.trim() || approvalSources.length > 0)
      ? { query: approvalQuery, summary: approvalSummary, sources: approvalSources }
      : null;
    const trustState = (confidence || grounding.length > 0)
      ? { confidence, grounding }
      : null;

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
  ]);

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
  }), [buildDiagnosisJson, caseIntake, handoffTouched, input, response]);

  const activeWorkspaceDraft = useMemo<SavedDraft>(() => ({
    id: savedDraftId ?? 'workspace-draft',
    input_text: input,
    summary_text: currentTicket?.summary ?? null,
    diagnosis_json: buildDiagnosisJson(),
    response_text: response || null,
    ticket_id: currentTicketId,
    kb_sources_json: sources.length > 0 ? JSON.stringify(sources) : null,
    created_at: new Date().toISOString(),
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
    input,
    currentTicket?.summary,
    buildDiagnosisJson,
    response,
    currentTicketId,
    sources,
    loadedModelName,
    serializedCaseIntake,
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

  const handleCopyHandoffPack = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(formatHandoffPackForClipboard(handoffPack));
      setHandoffTouched(true);
      if (savedDraftId) {
        await saveCaseOutcome({
          draft_id: savedDraftId,
          status: 'handoff-ready',
          outcome_summary: handoffPack.summary,
          handoff_pack_json: JSON.stringify(handoffPack),
          kb_draft_json: JSON.stringify(kbDraft),
          evidence_pack_json: JSON.stringify(evidencePack),
          tags_json: JSON.stringify([caseIntake.likely_category].filter(Boolean)),
        });
      }
      void logEvent('workspace_handoff_pack_copied', {
        ticket_id: currentTicketId,
        note_audience: caseIntake.note_audience,
      });
      showSuccess('Handoff pack copied');
    } catch {
      showError('Failed to copy handoff pack');
    }
  }, [handoffPack, savedDraftId, saveCaseOutcome, kbDraft, evidencePack, caseIntake.likely_category, logEvent, currentTicketId, caseIntake.note_audience, showSuccess, showError]);

  const handleCopyEvidencePack = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(formatEvidencePackForClipboard(evidencePack));
      if (savedDraftId) {
        await saveCaseOutcome({
          draft_id: savedDraftId,
          status: 'evidence-ready',
          outcome_summary: evidencePack.summary,
          handoff_pack_json: JSON.stringify(handoffPack),
          kb_draft_json: JSON.stringify(kbDraft),
          evidence_pack_json: JSON.stringify(evidencePack),
          tags_json: JSON.stringify(kbDraft.tags),
        });
      }
      void logEvent('workspace_evidence_pack_copied', { ticket_id: currentTicketId });
      showSuccess('Evidence pack copied');
    } catch {
      showError('Failed to copy evidence pack');
    }
  }, [evidencePack, savedDraftId, saveCaseOutcome, handoffPack, kbDraft, logEvent, currentTicketId, showSuccess, showError]);

  const handleCopyKbDraft = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(formatKbDraftForClipboard(kbDraft));
      if (savedDraftId) {
        await saveCaseOutcome({
          draft_id: savedDraftId,
          status: 'kb-promoted',
          outcome_summary: kbDraft.summary,
          handoff_pack_json: JSON.stringify(handoffPack),
          kb_draft_json: JSON.stringify(kbDraft),
          evidence_pack_json: JSON.stringify(evidencePack),
          tags_json: JSON.stringify(kbDraft.tags),
        });
      }
      void logEvent('workspace_kb_draft_copied', {
        ticket_id: currentTicketId,
        category: caseIntake.likely_category,
      });
      showSuccess('KB draft copied');
    } catch {
      showError('Failed to copy KB draft');
    }
  }, [kbDraft, saveCaseOutcome, savedDraftId, handoffPack, evidencePack, logEvent, currentTicketId, caseIntake.likely_category, showSuccess, showError]);

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
      void logEvent('workspace_resolution_kit_saved', {
        ticket_id: currentTicketId,
        category: nextKit.category,
      });
      showSuccess('Saved the current workspace as a resolution kit');
    } catch {
      showError('Failed to save resolution kit');
    }
  }, [caseIntake, kbDraft, response, sources, saveResolutionKit, refreshWorkspaceCatalog, logEvent, currentTicketId, showSuccess, showError]);

  const handleApplyResolutionKit = useCallback((kit: ResolutionKit) => {
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
    setDiagnosticNotes((prev) => compactLines([prev, applied.checklistText]));
    setPanelDensityMode('focus-intake');
    void logEvent('workspace_resolution_kit_applied', {
      ticket_id: currentTicketId,
      kit_id: kit.id,
      category: kit.category,
    });
    showSuccess(`Applied ${kit.name}`);
  }, [input, response, caseIntake, logEvent, currentTicketId, showSuccess]);

  const handleToggleWorkspaceFavorite = useCallback(async (
    kind: WorkspaceFavorite['kind'],
    resourceId: string,
    label: string,
    metadata?: Record<string, string> | null,
  ) => {
    try {
      const existing = workspaceFavorites.find((favorite) => favorite.kind === kind && favorite.resource_id === resourceId);
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
      void logEvent('workspace_favorite_toggled', {
        ticket_id: currentTicketId,
        kind,
        resource_id: resourceId,
      });
    } catch {
      showError('Failed to update favorites');
    }
  }, [
    workspaceFavorites,
    deleteWorkspaceFavorite,
    saveWorkspaceFavorite,
    refreshWorkspaceCatalog,
    showSuccess,
    logEvent,
    currentTicketId,
    showError,
  ]);

  const handleStartGuidedRunbook = useCallback(async (templateId: string) => {
    const template = runbookTemplates.find((item) => item.id === templateId);
    if (!template) {
      showError('Choose a guided runbook template first');
      return;
    }

    try {
      await startRunbookSession(template.scenario, template.steps, workspaceRunbookScopeKey);
      setGuidedRunbookNote('');
      await refreshWorkspaceCatalog();
      setPanelDensityMode('focus-intake');
      void logEvent('workspace_guided_runbook_started', {
        ticket_id: currentTicketId,
        template_id: template.id,
        scenario: template.scenario,
      });
      showSuccess(`Started ${template.name}`);
    } catch {
      showError('Failed to start guided runbook');
    }
  }, [
    runbookTemplates,
    startRunbookSession,
    refreshWorkspaceCatalog,
    workspaceRunbookScopeKey,
    logEvent,
    currentTicketId,
    showSuccess,
    showError,
  ]);

  const handleAdvanceGuidedRunbook = useCallback(async (
    status: 'completed' | 'skipped' | 'failed',
  ) => {
    if (!guidedRunbookSession) {
      showError('Start a guided runbook before updating a step');
      return;
    }

    const currentStep = guidedRunbookSession.current_step;
    const stepLabel = guidedRunbookSession.steps[currentStep] ?? `Step ${currentStep + 1}`;
    const noteText = guidedRunbookNote.trim();
    const evidenceText = noteText || `${status} · ${stepLabel}`;
    const skipReason = status === 'skipped' ? noteText || 'Skipped from workspace' : undefined;
    const nextStep = status === 'failed'
      ? currentStep
      : Math.min(currentStep + 1, Math.max(guidedRunbookSession.steps.length - 1, 0));
    const nextStatus = status === 'failed'
      ? 'paused'
      : currentStep >= guidedRunbookSession.steps.length - 1
        ? 'completed'
        : 'active';

    try {
      await addRunbookStepEvidence(guidedRunbookSession.id, currentStep, status, evidenceText, skipReason);
      await advanceRunbookSession(guidedRunbookSession.id, nextStep, nextStatus);
      if (noteText) {
        setDiagnosticNotes((prev) => compactLines([prev, `Runbook ${stepLabel}: ${noteText}`]));
      }
      setGuidedRunbookNote('');
      await refreshWorkspaceCatalog();
      void logEvent('workspace_guided_runbook_step_recorded', {
        ticket_id: currentTicketId,
        session_id: guidedRunbookSession.id,
        step_index: currentStep,
        status,
      });
      showSuccess(
        status === 'failed'
          ? `Paused the runbook at ${stepLabel}`
          : nextStatus === 'completed'
            ? 'Guided runbook completed'
            : `Recorded ${stepLabel}`,
      );
    } catch {
      showError('Failed to update guided runbook progress');
    }
  }, [
    guidedRunbookSession,
    guidedRunbookNote,
    addRunbookStepEvidence,
    advanceRunbookSession,
    refreshWorkspaceCatalog,
    currentTicketId,
    logEvent,
    showSuccess,
    showError,
  ]);

  const handleCopyRunbookProgressToNotes = useCallback(() => {
    if (!guidedRunbookSession || guidedRunbookSession.evidence.length === 0) {
      showError('No guided runbook progress to copy yet');
      return;
    }

    const progressText = compactLines([
      `Guided runbook: ${guidedRunbookSession.scenario}`,
      ...guidedRunbookSession.evidence.map((item) => {
        const stepLabel = guidedRunbookSession.steps[item.step_index] ?? `Step ${item.step_index + 1}`;
        return `- ${stepLabel}: ${item.status}${item.evidence_text ? ` · ${item.evidence_text}` : ''}`;
      }),
    ]);

    setDiagnosticNotes((prev) => compactLines([prev, progressText]));
    showSuccess('Copied guided runbook progress into the notes');
  }, [guidedRunbookSession, showError, showSuccess]);

  const hasLiveWorkspaceContent = useMemo(() => Boolean(
    input.trim()
    || response.trim()
    || diagnosticNotes.trim()
    || firstResponse.trim()
    || checklistItems.length > 0
    || similarCases.length > 0
    || handoffTouched,
  ), [
    diagnosticNotes,
    firstResponse,
    handoffTouched,
    input,
    checklistItems.length,
    response,
    similarCases.length,
  ]);

  const loadSimilarCaseIntoWorkspace = useCallback(async (similarCase: SimilarCase) => {
    const fullDraft = await getDraft(similarCase.draft_id);
    if (!fullDraft) {
      throw new Error('Could not load that saved case');
    }
    handleLoadDraft(fullDraft);
  }, [getDraft, handleLoadDraft]);

  const handleOpenSimilarCase = useCallback(async (similarCase: SimilarCase) => {
    if (similarCase.draft_id !== savedDraftId && hasLiveWorkspaceContent) {
      setPendingSimilarCaseOpen(similarCase);
      return;
    }

    try {
      await loadSimilarCaseIntoWorkspace(similarCase);
      setPendingSimilarCaseOpen(null);
      void logEvent('workspace_similar_case_opened', {
        ticket_id: currentTicketId,
        similar_case_id: similarCase.draft_id,
        similar_case_ticket: similarCase.ticket_id,
      });
      showSuccess('Loaded similar case into the workspace');
    } catch {
      showError('Failed to open similar case');
    }
  }, [
    hasLiveWorkspaceContent,
    loadSimilarCaseIntoWorkspace,
    logEvent,
    currentTicketId,
    savedDraftId,
    setPendingSimilarCaseOpen,
    showError,
    showSuccess,
  ]);

  const handleCompareSimilarCase = useCallback((similarCase: SimilarCase) => {
    if (!response.trim()) {
      showError('Generate or paste a response before comparing it to a prior resolution');
      return;
    }
    setCompareCase(similarCase);
  }, [response, showError]);

  const handleAcceptNextAction = useCallback((action: NextActionRecommendation) => {
    void logEvent('workspace_next_action_accepted', {
      ticket_id: currentTicketId,
      action_kind: action.kind,
      action_id: action.id,
    });

    if (action.kind === 'answer') {
      void handleGenerate();
      return;
    }

    if (action.kind === 'clarify') {
      const clarifyPrompt = compactLines([
        diagnosticNotes,
        'Clarifying questions to ask:',
        ...missingQuestions.map((question) => `- ${question.question}`),
      ]);
      setDiagnosticNotes(clarifyPrompt);
      setPanelDensityMode('focus-intake');
      showSuccess('Added clarifying questions to the diagnostic notes');
      return;
    }

    if (action.kind === 'approval') {
      const querySeed = compactLines([
        caseIntake.issue,
        currentTicket?.summary,
        input,
      ]);
      setApprovalQuery(`${querySeed || 'support request'} policy approval`);
      setPanelDensityMode('focus-intake');
      showSuccess('Primed the approval search query');
      return;
    }

    if (action.kind === 'runbook') {
      setPanelDensityMode('focus-intake');
      setDiagnosticNotes((prev) => compactLines([
        prev,
        'Runbook kickoff:',
        `- ${action.rationale}`,
        ...action.prerequisites.map((item) => `- ${item}`),
      ]));
      const incidentTemplate = runbookTemplates.find((template) =>
        /incident|security/i.test(`${template.name} ${template.scenario}`),
      );
      if (incidentTemplate) {
        void handleStartGuidedRunbook(incidentTemplate.id);
      }
      showSuccess('Prepared the workspace for guided runbook steps');
      return;
    }

    if (action.kind === 'escalate') {
      setCaseIntake((prev) => ({
        ...prev,
        note_audience: 'escalation-note',
      }));
      setDiagnosticNotes((prev) => compactLines([
        prev,
        'Escalation focus:',
        `- ${action.rationale}`,
      ]));
      showSuccess('Switched the workspace into escalation-note mode');
      return;
    }

    void handleCopyKbDraft();
  }, [
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
  ]);

  useEffect(() => {
    if (!workspaceRailEnabled) {
      return;
    }

    const handleAnalyze = () => handleAnalyzeIntake();
    const handleCopyHandoff = () => void handleCopyHandoffPack();
    const handleCopyEvidence = () => void handleCopyEvidencePack();
    const handleCopyKbDraftFromEvent = () => void handleCopyKbDraft();
    const handleRefreshCases = () => void handleRefreshSimilarCases();
    const handleCompareLast = () => handleCompareLastResolution();

    window.addEventListener(WORKSPACE_ANALYZE_INTAKE_EVENT, handleAnalyze);
    window.addEventListener(WORKSPACE_COPY_HANDOFF_EVENT, handleCopyHandoff);
    window.addEventListener(WORKSPACE_COPY_EVIDENCE_EVENT, handleCopyEvidence);
    window.addEventListener(WORKSPACE_COPY_KB_DRAFT_EVENT, handleCopyKbDraftFromEvent);
    window.addEventListener(WORKSPACE_REFRESH_SIMILAR_CASES_EVENT, handleRefreshCases);
    window.addEventListener(WORKSPACE_COMPARE_LAST_RESOLUTION_EVENT, handleCompareLast);

    return () => {
      window.removeEventListener(WORKSPACE_ANALYZE_INTAKE_EVENT, handleAnalyze);
      window.removeEventListener(WORKSPACE_COPY_HANDOFF_EVENT, handleCopyHandoff);
      window.removeEventListener(WORKSPACE_COPY_EVIDENCE_EVENT, handleCopyEvidence);
      window.removeEventListener(WORKSPACE_COPY_KB_DRAFT_EVENT, handleCopyKbDraftFromEvent);
      window.removeEventListener(WORKSPACE_REFRESH_SIMILAR_CASES_EVENT, handleRefreshCases);
      window.removeEventListener(WORKSPACE_COMPARE_LAST_RESOLUTION_EVENT, handleCompareLast);
    };
  }, [
    workspaceRailEnabled,
    handleAnalyzeIntake,
    handleCompareLastResolution,
    handleCopyEvidencePack,
    handleCopyHandoffPack,
    handleCopyKbDraft,
    handleRefreshSimilarCases,
  ]);

  const handleSaveDraft = useCallback(async () => {
    if (!hasSaveableWorkspaceContent) {
      showError('Cannot save empty draft');
      return null;
    }

    const diagnosisData = buildDiagnosisJson();

    const draftId = await saveDraft({
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
      status: 'draft',
    });

    if (draftId) {
      const nextScopeKey = `draft:${draftId}`;
      let runbookScopeLinked = true;
      if (workspaceRunbookScopeKey !== nextScopeKey) {
        try {
          await reassignRunbookSessionScope(workspaceRunbookScopeKey, nextScopeKey);
          setWorkspaceRunbookScopeKey(nextScopeKey);
        } catch {
          runbookScopeLinked = false;
        }
      }
      setAutosaveDraftId(null);
      setSavedDraftId(draftId);
      const responseWordCount = countWords(response);
      const editRatio = calculateEditRatio(originalResponse, response);
      logEvent('response_saved', {
        draft_id: draftId,
        word_count: responseWordCount,
        is_edited: isResponseEdited,
        edit_ratio: Number(editRatio.toFixed(3)),
      });
      if (runbookScopeLinked) {
        showSuccess('Draft saved');
      } else {
        showError('Draft saved, but guided runbook progress stayed attached to the previous workspace state');
      }
      return draftId;
    }
    return null;
  }, [hasSaveableWorkspaceContent, currentTicket?.summary, buildDiagnosisJson, response, currentTicketId, sources, saveDraft, showError, showSuccess, loadedModelName, serializedCaseIntake, handoffPack.summary, workspaceRunbookScopeKey, reassignRunbookSessionScope, originalResponse, isResponseEdited, logEvent]);

  const handleConfirmOpenSimilarCase = useCallback(async (
    mode: 'replace' | 'save-and-open' | 'compare',
  ) => {
    if (!pendingSimilarCaseOpen) {
      return;
    }

    if (mode === 'compare') {
      setCompareCase(pendingSimilarCaseOpen);
      setPendingSimilarCaseOpen(null);
      return;
    }

    try {
      if (mode === 'save-and-open') {
        const savedId = await handleSaveDraft();
        if (!shouldProceedAfterSaveAttempt(mode, savedId)) {
          return;
        }
      }

      await loadSimilarCaseIntoWorkspace(pendingSimilarCaseOpen);
      setPendingSimilarCaseOpen(null);
      void logEvent('workspace_similar_case_opened', {
        ticket_id: currentTicketId,
        similar_case_id: pendingSimilarCaseOpen.draft_id,
        similar_case_ticket: pendingSimilarCaseOpen.ticket_id,
        open_mode: mode,
      });
      showSuccess(
        mode === 'save-and-open'
          ? 'Saved the current workspace and opened the saved case'
          : 'Opened the saved case in the workspace',
      );
    } catch {
      showError('Failed to open the saved case');
    }
  }, [
    currentTicketId,
    handleSaveDraft,
    loadSimilarCaseIntoWorkspace,
    logEvent,
    pendingSimilarCaseOpen,
    showError,
    showSuccess,
  ]);

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

  useEffect(() => {
    if (!approvalQuery.trim()) {
      setApprovalResults([]);
      setApprovalSummary('');
      setApprovalSources([]);
      setApprovalError(null);
    }
  }, [approvalQuery]);

  // Trigger autosave on content changes
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

      triggerAutosave({
        input_text: input,
        summary_text: currentTicket?.summary ?? null,
        diagnosis_json: diagnosisData,
        response_text: response || null,
        ticket_id: currentTicketId,
        kb_sources_json: sources.length > 0 ? JSON.stringify(sources) : null,
        model_name: loadedModelName,
        case_intake_json: serializedCaseIntake,
        handoff_summary: handoffPack.summary,
        status: 'draft',
      }, autosaveState.autosaveRecordId, hasSaveableWorkspaceContent);
    }
    return () => {
      cancelAutosave();
    };
  }, [input, savedDraftId, autosaveDraftId, currentTicket?.summary, buildDiagnosisJson, response, currentTicketId, sources, loadedModelName, triggerAutosave, cancelAutosave, serializedCaseIntake, handoffPack.summary, hasSaveableWorkspaceContent]);

  const handleCopyResponse = useCallback(async () => {
    if (!response) return;
    try {
      const mode = confidence?.mode ?? 'answer';
      const hasCitations = sources.length > 0;
      const copyAllowed = mode === 'answer' && hasCitations;

      if (!copyAllowed) {
        const reason = window.prompt(
          'Copy override required. This response is missing citations or is not in answer mode.\n\nEnter a reason to proceed (will be logged locally):',
        );
        if (!reason || !reason.trim()) {
          showError('Copy cancelled (reason required).');
          return;
        }
        await invoke('audit_response_copy_override', {
          reason: reason.trim(),
          confidenceMode: confidence?.mode ?? null,
          sourcesCount: sources.length,
        });
      }
      await navigator.clipboard.writeText(response);
      setHandoffTouched(true);
      logEvent('response_copied', {
        draft_id: savedDraftId,
        word_count: countWords(response),
        is_edited: isResponseEdited,
        edit_ratio: Number(calculateEditRatio(originalResponse, response).toFixed(3)),
      });
      showSuccess('Response copied to clipboard');
    } catch (e) {
      showError('Failed to copy response');
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
      showError('No response to export');
      return;
    }
    try {
      const saved = await invoke<boolean>('export_draft', {
        responseText: response,
        format: 'Markdown',
      });
      if (saved) {
        setHandoffTouched(true);
        showSuccess('Response exported successfully');
      }
    } catch (e) {
      showError(`Export failed: ${e}`);
    }
  }, [response, showSuccess, showError, setHandoffTouched]);

  // Expose functions to parent via ref
  useImperativeHandle(ref, () => ({
    generate: handleGenerate,
    loadDraft: handleLoadDraft,
    saveDraft: handleSaveDraft,
    copyResponse: handleCopyResponse,
    cancelGeneration: handleCancel,
    exportResponse: handleExportResponse,
    clearDraft: handleClear,
  }), [handleGenerate, handleLoadDraft, handleSaveDraft, handleCopyResponse, handleCancel, handleExportResponse, handleClear]);

  const isConversation = viewMode === 'conversation';
  const checklistCompletedCount = checklistItems.reduce((count, item) => {
    return checklistCompleted[item.id] ? count + 1 : count;
  }, 0);
  const responseWordCount = countWords(response);
  const responseEditRatio = calculateEditRatio(originalResponse, response);

  const viewToggle = (
    <div className="draft-view-header">
      <div className="view-toggle">
        <button className={`view-btn ${!isConversation ? 'active' : ''}`} onClick={() => handleViewModeChange('panels')}>Panels</button>
        <button className={`view-btn ${isConversation ? 'active' : ''}`} onClick={() => handleViewModeChange('conversation')}>Conversation</button>
      </div>
    </div>
  );

  if (isConversation) {
    return (
      <div className={['draft-tab', 'conversation-mode', revampModeEnabled ? 'draft-tab--revamp' : ''].filter(Boolean).join(' ')}>
        {viewToggle}
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
        <ConversationThread
          entries={conversationEntries}
          streamingText={streamingText}
          isStreaming={isStreaming}
        />
        <ConversationInput
          onSubmit={handleConversationSubmit}
          generating={generating}
          modelLoaded={modelLoaded}
          responseLength={responseLength}
          onResponseLengthChange={handleResponseLengthChange}
          onCancel={handleCancel}
        />
      </div>
    );
  }

  return (
    <div
      className={[
        'draft-tab',
        `panel-density-${panelDensityMode}`,
        diagnosisCollapsed ? 'diagnosis-collapsed' : '',
        revampModeEnabled ? 'draft-tab--revamp' : '',
        workspaceRailEnabled ? 'has-workspace-rail' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {viewToggle}
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
      <section className="draft-workflow-strip" aria-label="Draft workflow overview">
        <div className="draft-workflow-step">
          <h4>1. Intake</h4>
          <p>{countWords(input)} words captured {currentTicketId ? '· ticket linked' : '· no ticket linked'}</p>
        </div>
        <div className="draft-workflow-step">
          <h4>2. Diagnose</h4>
          <p>
            {treeResult ? 'Tree completed' : 'Tree not run'}
            {' · '}
            checklist {checklistCompletedCount}/{checklistItems.length}
          </p>
        </div>
        <div className="draft-workflow-step">
          <h4>3. Draft</h4>
          <p>
            {responseWordCount} words
            {isResponseEdited ? ` · edited (${Math.round(responseEditRatio * 100)}%)` : ' · unedited'}
          </p>
        </div>
        <div className="draft-workflow-step">
          <h4>4. Handoff</h4>
          <p>
            {response?.trim()
              ? handoffTouched
                ? 'Copied/exported'
                : 'Ready to copy/export'
              : 'No response yet'}
          </p>
        </div>
        <div className="draft-workflow-actions">
          <div className="draft-layout-mode-toggle" role="group" aria-label="Draft panel layout">
            <button
              type="button"
              className={`draft-layout-mode-btn ${panelDensityMode === 'balanced' ? 'active' : ''}`}
              onClick={() => handlePanelDensityModeChange('balanced')}
            >
              Balanced
            </button>
            <button
              type="button"
              className={`draft-layout-mode-btn ${panelDensityMode === 'focus-intake' ? 'active' : ''}`}
              onClick={() => handlePanelDensityModeChange('focus-intake')}
            >
              Intake Focus
            </button>
            <button
              type="button"
              className={`draft-layout-mode-btn ${panelDensityMode === 'focus-response' ? 'active' : ''}`}
              onClick={() => handlePanelDensityModeChange('focus-response')}
            >
              Response Focus
            </button>
          </div>
          <Button
            size="small"
            variant="secondary"
            onClick={handleGenerateFirstResponse}
            disabled={!modelLoaded || firstResponseGenerating || !input.trim()}
          >
            Draft First Reply
          </Button>
          <Button
            size="small"
            variant="ghost"
            onClick={handleChecklistGenerate}
            disabled={!modelLoaded || checklistGenerating || (!input.trim() && !ocrText?.trim() && !currentTicket)}
          >
            Build Checklist
          </Button>
          <Button
            size="small"
            variant="primary"
            onClick={handleGenerate}
            disabled={!modelLoaded || generating || !input.trim()}
            title="Generate response (Cmd+G in input)"
            aria-keyshortcuts="Meta+G"
          >
            Generate Full Response
          </Button>
          <Button
            size="small"
            variant="ghost"
            onClick={handleSaveDraft}
            disabled={!input.trim()}
          >
            Save
          </Button>
          <div className="draft-workflow-shortcuts" aria-label="Keyboard shortcuts">
            <span><kbd>Cmd</kbd>+<kbd>G</kbd> Generate</span>
            <span><kbd>Cmd</kbd>+<kbd>N</kbd> Clear</span>
            <span><kbd>Cmd</kbd>+<kbd>1</kbd>/<kbd>2</kbd>/<kbd>3</kbd> Layout</span>
          </div>
        </div>
      </section>
      <div className="draft-panels-container">
        <div className="draft-panel input-panel">
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
        </div>

        <div className={`draft-panel diagnosis-panel ${diagnosisCollapsed ? 'collapsed' : ''}`}>
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
        </div>

        <div className="draft-panel response-panel">
          {!suggestionsDismissed && suggestions.length > 0 && !response && (
            <SavedResponsesSuggestion
              suggestions={suggestions}
              onApply={handleSuggestionApply}
              onDismiss={handleSuggestionDismiss}
            />
          )}
          <ResponsePanel
            response={response}
            streamingText={streamingText}
            isStreaming={isStreaming}
            sources={sources}
            generating={generating}
            metrics={metrics}
            confidence={confidence}
            grounding={grounding}
            draftId={savedDraftId}
            onSaveDraft={handleSaveDraft}
            onCancel={handleCancel}
            hasInput={!!input.trim()}
            onResponseChange={handleResponseChange}
            isEdited={isResponseEdited}
            modelName={loadedModelName}
            onGenerateAlternative={handleGenerateAlternative}
            generatingAlternative={generatingAlternative}
            ticketKey={currentTicketId}
            onSaveAsTemplate={handleSaveAsTemplate}
          />
          {alternatives.length > 0 && response && !generating && !isStreaming && (
            <AlternativePanel
              alternatives={alternatives}
              onChoose={handleChooseAlternative}
              onUseAlternative={handleUseAlternative}
            />
          )}
        </div>

        {workspaceRailEnabled && (
          <div className="draft-panel workspace-panel">
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
              onRunbookNoteChange={setGuidedRunbookNote}
              onStartGuidedRunbook={handleStartGuidedRunbook}
              onAdvanceGuidedRunbook={handleAdvanceGuidedRunbook}
              onCopyRunbookProgressToNotes={handleCopyRunbookProgressToNotes}
              workspacePersonalization={workspacePersonalization}
              onPersonalizationChange={handleWorkspacePersonalizationChange}
              workspaceCatalogLoading={workspaceCatalogLoading}
              currentResponse={response}
            />
          </div>
        )}
      </div>

      {showTemplateModal && response && (
        <SaveAsTemplateModal
          content={response}
          sourceDraftId={savedDraftId ?? undefined}
          sourceRating={templateModalRating}
          onSave={handleTemplateModalSave}
          onClose={() => setShowTemplateModal(false)}
        />
      )}

      <Dialog
        open={pendingSimilarCaseOpen !== null}
        onClose={() => setPendingSimilarCaseOpen(null)}
        ariaLabel="Open another saved case"
      >
        <div className="draft-tab__confirm-dialog">
          <h3>Open another saved case?</h3>
          <p>
            Your current workspace still has in-progress content. Save it first, compare it to the
            saved case, or replace it intentionally.
          </p>
          {pendingSimilarCaseOpen && (
            <p className="draft-tab__confirm-dialog-target">
              Next case: <strong>{pendingSimilarCaseOpen.title}</strong>
            </p>
          )}
          <div className="draft-tab__confirm-dialog-actions">
            <Button variant="ghost" onClick={() => setPendingSimilarCaseOpen(null)}>
              Cancel
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                void handleConfirmOpenSimilarCase('compare');
              }}
              disabled={!response.trim()}
            >
              Compare instead
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                void handleConfirmOpenSimilarCase('save-and-open');
              }}
            >
              Save and open
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                void handleConfirmOpenSimilarCase('replace');
              }}
            >
              Open anyway
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
});
