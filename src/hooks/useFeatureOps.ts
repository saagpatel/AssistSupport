import { useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type {
  CaseOutcomeRecord,
  DispatchHistoryRecord,
  DeploymentArtifactRecord,
  DeploymentHealthSummary,
  EvalRunRecord,
  IntegrationConfigRecord,
  KbGapCandidate,
  ResolutionKit,
  ResolutionKitRecord,
  RunbookStepEvidenceRecord,
  RunbookSessionRecord,
  RunbookTemplateRecord,
  SignedArtifactVerificationResult,
  TriageClusterRecord,
  WorkspaceFavorite,
  WorkspaceFavoriteRecord,
} from '../types';

export interface DeploymentPreflightResult {
  ok: boolean;
  checks: string[];
}

export interface EvalHarnessCase {
  query: string;
  expected_mode?: string;
  min_confidence?: number;
}

export interface EvalHarnessResult {
  run_id: string;
  total_cases: number;
  passed_cases: number;
  avg_confidence: number;
}

export interface TriageTicketInput {
  id: string;
  summary: string;
}

export interface TriageClusterOutput {
  cluster_key: string;
  summary: string;
  ticket_ids: string[];
}

export interface CollaborationDispatchInput {
  integrationType: 'jira' | 'servicenow' | 'slack' | 'teams';
  draftId?: string | null;
  title: string;
  destinationLabel: string;
  payloadPreview: string;
  metadataJson?: string | null;
}

export function useFeatureOps() {
  const getKbGapCandidates = useCallback(async (limit = 20, status = 'open'): Promise<KbGapCandidate[]> => {
    return invoke<KbGapCandidate[]>('get_kb_gap_candidates', { limit, status });
  }, []);

  const updateKbGapStatus = useCallback(async (
    id: string,
    status: 'open' | 'accepted' | 'resolved' | 'ignored',
    resolutionNote?: string,
  ): Promise<void> => {
    await invoke('update_kb_gap_status', {
      id,
      status,
      resolutionNote: resolutionNote ?? null,
    });
  }, []);

  const getDeploymentHealthSummary = useCallback(async (): Promise<DeploymentHealthSummary> => {
    return invoke<DeploymentHealthSummary>('get_deployment_health_summary');
  }, []);

  const listDeploymentArtifacts = useCallback(async (limit = 50): Promise<DeploymentArtifactRecord[]> => {
    return invoke<DeploymentArtifactRecord[]>('list_deployment_artifacts', { limit });
  }, []);

  const runDeploymentPreflight = useCallback(async (targetChannel: string): Promise<DeploymentPreflightResult> => {
    return invoke<DeploymentPreflightResult>('run_deployment_preflight', { targetChannel });
  }, []);

  const recordDeploymentArtifact = useCallback(async (
    artifactType: string,
    version: string,
    channel: string,
    sha256: string,
    isSigned: boolean,
  ): Promise<string> => {
    return invoke<string>('record_deployment_artifact', {
      artifactType,
      version,
      channel,
      sha256,
      isSigned,
    });
  }, []);

  const verifySignedArtifact = useCallback(async (
    artifactId: string,
    expectedSha256?: string,
  ): Promise<SignedArtifactVerificationResult> => {
    return invoke<SignedArtifactVerificationResult>('verify_signed_artifact', {
      artifactId,
      expectedSha256: expectedSha256 ?? null,
    });
  }, []);

  const rollbackDeploymentRun = useCallback(async (runId: string, reason?: string): Promise<void> => {
    await invoke('rollback_deployment_run', {
      runId,
      reason: reason ?? null,
    });
  }, []);

  const runEvalHarness = useCallback(async (
    suiteName: string,
    cases: EvalHarnessCase[],
  ): Promise<EvalHarnessResult> => {
    return invoke<EvalHarnessResult>('run_eval_harness', { suiteName, cases });
  }, []);

  const listEvalRuns = useCallback(async (limit = 50): Promise<EvalRunRecord[]> => {
    return invoke<EvalRunRecord[]>('list_eval_runs', { limit });
  }, []);

  const clusterTicketsForTriage = useCallback(async (
    tickets: TriageTicketInput[],
  ): Promise<TriageClusterOutput[]> => {
    return invoke<TriageClusterOutput[]>('cluster_tickets_for_triage', { tickets });
  }, []);

  const listRecentTriageClusters = useCallback(async (limit = 50): Promise<TriageClusterRecord[]> => {
    return invoke<TriageClusterRecord[]>('list_recent_triage_clusters', { limit });
  }, []);

  const startRunbookSession = useCallback(async (
    scenario: string,
    steps: string[],
    scopeKey: string,
  ): Promise<RunbookSessionRecord> => {
    return invoke<RunbookSessionRecord>('start_runbook_session', { scenario, steps, scopeKey });
  }, []);

  const advanceRunbookSession = useCallback(async (
    sessionId: string,
    currentStep: number,
    status?: string,
  ): Promise<void> => {
    await invoke('advance_runbook_session', {
      sessionId,
      currentStep,
      status: status ?? null,
    });
  }, []);

  const listRunbookSessions = useCallback(async (
    limit = 50,
    status?: string,
    scopeKey?: string,
  ): Promise<RunbookSessionRecord[]> => {
    return invoke<RunbookSessionRecord[]>('list_runbook_sessions', {
      limit,
      status: status ?? null,
      scopeKey: scopeKey ?? null,
    });
  }, []);

  const reassignRunbookSessionScope = useCallback(async (
    fromScopeKey: string,
    toScopeKey: string,
  ): Promise<void> => {
    await invoke('reassign_runbook_session_scope', {
      fromScopeKey,
      toScopeKey,
    });
  }, []);

  const reassignRunbookSessionById = useCallback(async (
    sessionId: string,
    toScopeKey: string,
  ): Promise<void> => {
    await invoke('reassign_runbook_session_by_id', {
      sessionId,
      toScopeKey,
    });
  }, []);

  const listRunbookTemplates = useCallback(async (limit = 50): Promise<RunbookTemplateRecord[]> => {
    return invoke<RunbookTemplateRecord[]>('list_runbook_templates', { limit });
  }, []);

  const saveRunbookTemplate = useCallback(async (
    template: Omit<RunbookTemplateRecord, 'id' | 'created_at' | 'updated_at'> & { id?: string },
  ): Promise<string> => {
    return invoke<string>('save_runbook_template', { template });
  }, []);

  const listRunbookStepEvidence = useCallback(async (
    sessionId: string,
  ): Promise<RunbookStepEvidenceRecord[]> => {
    return invoke<RunbookStepEvidenceRecord[]>('list_runbook_step_evidence', { sessionId });
  }, []);

  const addRunbookStepEvidence = useCallback(async (
    sessionId: string,
    stepIndex: number,
    status: RunbookStepEvidenceRecord['status'],
    evidenceText: string,
    skipReason?: string,
  ): Promise<RunbookStepEvidenceRecord> => {
    return invoke<RunbookStepEvidenceRecord>('add_runbook_step_evidence', {
      sessionId,
      stepIndex,
      status,
      evidenceText,
      skipReason: skipReason ?? null,
    });
  }, []);

  const listResolutionKits = useCallback(async (limit = 50): Promise<ResolutionKitRecord[]> => {
    return invoke<ResolutionKitRecord[]>('list_resolution_kits', { limit });
  }, []);

  const saveResolutionKit = useCallback(async (
    kit: Omit<ResolutionKit, 'id'> & { id?: string },
  ): Promise<string> => {
    return invoke<string>('save_resolution_kit', {
      kit: {
        id: kit.id ?? '',
        name: kit.name,
        summary: kit.summary,
        category: kit.category,
        response_template: kit.response_template,
        checklist_items_json: JSON.stringify(kit.checklist_items),
        kb_document_ids_json: JSON.stringify(kit.kb_document_ids),
        runbook_scenario: kit.runbook_scenario,
        approval_hint: kit.approval_hint,
        created_at: '',
        updated_at: '',
      },
    });
  }, []);

  const listWorkspaceFavorites = useCallback(async (): Promise<WorkspaceFavoriteRecord[]> => {
    return invoke<WorkspaceFavoriteRecord[]>('list_workspace_favorites');
  }, []);

  const saveWorkspaceFavorite = useCallback(async (
    favorite: Omit<WorkspaceFavorite, 'id'> & { id?: string },
  ): Promise<string> => {
    return invoke<string>('save_workspace_favorite', {
      favorite: {
        id: favorite.id ?? '',
        kind: favorite.kind,
        label: favorite.label,
        resource_id: favorite.resource_id,
        metadata_json: favorite.metadata ? JSON.stringify(favorite.metadata) : null,
        created_at: '',
        updated_at: '',
      },
    });
  }, []);

  const deleteWorkspaceFavorite = useCallback(async (favoriteId: string): Promise<void> => {
    await invoke('delete_workspace_favorite', { favoriteId });
  }, []);

  const previewCollaborationDispatch = useCallback(async (
    preview: CollaborationDispatchInput,
  ): Promise<DispatchHistoryRecord> => {
    return invoke<DispatchHistoryRecord>('preview_collaboration_dispatch', {
      integrationType: preview.integrationType,
      draftId: preview.draftId ?? null,
      title: preview.title,
      destinationLabel: preview.destinationLabel,
      payloadPreview: preview.payloadPreview,
      metadataJson: preview.metadataJson ?? null,
    });
  }, []);

  const confirmCollaborationDispatch = useCallback(async (dispatchId: string): Promise<DispatchHistoryRecord> => {
    return invoke<DispatchHistoryRecord>('confirm_collaboration_dispatch', { dispatchId });
  }, []);

  const cancelCollaborationDispatch = useCallback(async (dispatchId: string): Promise<DispatchHistoryRecord> => {
    return invoke<DispatchHistoryRecord>('cancel_collaboration_dispatch', { dispatchId });
  }, []);

  const listDispatchHistory = useCallback(async (
    limit = 50,
    status?: DispatchHistoryRecord['status'],
  ): Promise<DispatchHistoryRecord[]> => {
    return invoke<DispatchHistoryRecord[]>('list_dispatch_history', {
      limit,
      status: status ?? null,
    });
  }, []);

  const saveCaseOutcome = useCallback(async (
    outcome: Omit<CaseOutcomeRecord, 'id' | 'created_at' | 'updated_at'> & { id?: string },
  ): Promise<string> => {
    return invoke<string>('save_case_outcome', { outcome });
  }, []);

  const listCaseOutcomes = useCallback(async (limit = 50): Promise<CaseOutcomeRecord[]> => {
    return invoke<CaseOutcomeRecord[]>('list_case_outcomes', { limit });
  }, []);

  const listIntegrations = useCallback(async (): Promise<IntegrationConfigRecord[]> => {
    return invoke<IntegrationConfigRecord[]>('list_integrations');
  }, []);

  const configureIntegration = useCallback(async (
    integrationType: string,
    enabled: boolean,
    configJson?: string,
  ): Promise<void> => {
    await invoke('configure_integration', {
      integrationType,
      enabled,
      configJson: configJson ?? null,
    });
  }, []);

  return {
    getKbGapCandidates,
    updateKbGapStatus,
    getDeploymentHealthSummary,
    listDeploymentArtifacts,
    runDeploymentPreflight,
    recordDeploymentArtifact,
    verifySignedArtifact,
    rollbackDeploymentRun,
    runEvalHarness,
    listEvalRuns,
    clusterTicketsForTriage,
    listRecentTriageClusters,
    startRunbookSession,
    advanceRunbookSession,
    listRunbookSessions,
    reassignRunbookSessionScope,
    reassignRunbookSessionById,
    listRunbookTemplates,
    saveRunbookTemplate,
    listRunbookStepEvidence,
    addRunbookStepEvidence,
    listResolutionKits,
    saveResolutionKit,
    listWorkspaceFavorites,
    saveWorkspaceFavorite,
    deleteWorkspaceFavorite,
    previewCollaborationDispatch,
    confirmCollaborationDispatch,
    cancelCollaborationDispatch,
    listDispatchHistory,
    saveCaseOutcome,
    listCaseOutcomes,
    listIntegrations,
    configureIntegration,
  };
}
