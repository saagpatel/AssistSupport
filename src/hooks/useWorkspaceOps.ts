import { useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type {
  ResolutionKit,
  WorkspaceFavorite,
} from '../types/workspace';
import type {
  CaseOutcomeRecord,
  ResolutionKitRecord,
  RunbookSessionRecord,
  RunbookStepEvidenceRecord,
  RunbookTemplateRecord,
  WorkspaceFavoriteRecord,
} from '../types/workspaceOps';

export interface WorkspaceOpsClient {
  listResolutionKits: (limit?: number) => Promise<ResolutionKitRecord[]>;
  saveResolutionKit: (kit: Omit<ResolutionKit, 'id'> & { id?: string }) => Promise<string>;
  listWorkspaceFavorites: () => Promise<WorkspaceFavoriteRecord[]>;
  saveWorkspaceFavorite: (favorite: Omit<WorkspaceFavorite, 'id'> & { id?: string }) => Promise<string>;
  deleteWorkspaceFavorite: (favoriteId: string) => Promise<void>;
  listRunbookTemplates: (limit?: number) => Promise<RunbookTemplateRecord[]>;
  saveRunbookTemplate: (
    template: Omit<RunbookTemplateRecord, 'id' | 'created_at' | 'updated_at'> & { id?: string },
  ) => Promise<string>;
  startRunbookSession: (scenario: string, steps: string[], scopeKey: string) => Promise<RunbookSessionRecord>;
  advanceRunbookSession: (sessionId: string, currentStep: number, status?: string) => Promise<void>;
  listRunbookSessions: (limit?: number, status?: string, scopeKey?: string) => Promise<RunbookSessionRecord[]>;
  reassignRunbookSessionScope: (fromScopeKey: string, toScopeKey: string) => Promise<void>;
  reassignRunbookSessionById: (sessionId: string, toScopeKey: string) => Promise<void>;
  listRunbookStepEvidence: (sessionId: string) => Promise<RunbookStepEvidenceRecord[]>;
  addRunbookStepEvidence: (
    sessionId: string,
    stepIndex: number,
    status: RunbookStepEvidenceRecord['status'],
    evidenceText: string,
    skipReason?: string,
  ) => Promise<RunbookStepEvidenceRecord>;
  saveCaseOutcome: (
    outcome: Omit<CaseOutcomeRecord, 'id' | 'created_at' | 'updated_at'> & { id?: string },
  ) => Promise<string>;
  listCaseOutcomes: (limit?: number) => Promise<CaseOutcomeRecord[]>;
}

export function useWorkspaceOps(): WorkspaceOpsClient {
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

  const listRunbookTemplates = useCallback(async (limit = 50): Promise<RunbookTemplateRecord[]> => {
    return invoke<RunbookTemplateRecord[]>('list_runbook_templates', { limit });
  }, []);

  const saveRunbookTemplate = useCallback(async (
    template: Omit<RunbookTemplateRecord, 'id' | 'created_at' | 'updated_at'> & { id?: string },
  ): Promise<string> => {
    return invoke<string>('save_runbook_template', { template });
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

  const saveCaseOutcome = useCallback(async (
    outcome: Omit<CaseOutcomeRecord, 'id' | 'created_at' | 'updated_at'> & { id?: string },
  ): Promise<string> => {
    return invoke<string>('save_case_outcome', { outcome });
  }, []);

  const listCaseOutcomes = useCallback(async (limit = 50): Promise<CaseOutcomeRecord[]> => {
    return invoke<CaseOutcomeRecord[]>('list_case_outcomes', { limit });
  }, []);

  return {
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
    listCaseOutcomes,
  };
}
