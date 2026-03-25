// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useWorkspaceCatalog } from './useWorkspaceCatalog';
import type { WorkspaceOpsClient } from '../../hooks/useWorkspaceOps';
import type {
  ResolutionKitRecord,
  RunbookSessionRecord,
  RunbookStepEvidenceRecord,
  RunbookTemplateRecord,
  WorkspaceFavoriteRecord,
} from '../../types/workspaceOps';

function makeOps(overrides: Partial<WorkspaceOpsClient> = {}): WorkspaceOpsClient {
  return {
    listResolutionKits: vi.fn(async () => [] as ResolutionKitRecord[]),
    saveResolutionKit: vi.fn(async () => 'kit-1'),
    listWorkspaceFavorites: vi.fn(async () => [] as WorkspaceFavoriteRecord[]),
    saveWorkspaceFavorite: vi.fn(async () => 'fav-1'),
    deleteWorkspaceFavorite: vi.fn(async () => undefined),
    listRunbookTemplates: vi.fn(async () => [] as RunbookTemplateRecord[]),
    saveRunbookTemplate: vi.fn(async () => 'template-1'),
    startRunbookSession: vi.fn(async () => ({
      id: 'session-1',
      scenario: 'security-incident',
      scope_key: 'workspace:test',
      status: 'active',
      steps_json: '["Step 1"]',
      current_step: 0,
      created_at: '2026-03-24T12:00:00.000Z',
      updated_at: '2026-03-24T12:00:00.000Z',
    }) as RunbookSessionRecord),
    advanceRunbookSession: vi.fn(async () => undefined),
    listRunbookSessions: vi.fn(async () => [] as RunbookSessionRecord[]),
    reassignRunbookSessionScope: vi.fn(async () => undefined),
    reassignRunbookSessionById: vi.fn(async () => undefined),
    listRunbookStepEvidence: vi.fn(async () => [] as RunbookStepEvidenceRecord[]),
    addRunbookStepEvidence: vi.fn(async () => ({
      id: 'evidence-1',
      session_id: 'session-1',
      step_index: 0,
      status: 'completed',
      evidence_text: 'done',
      skip_reason: null,
      created_at: '2026-03-24T12:00:00.000Z',
    })),
    saveCaseOutcome: vi.fn(async () => 'outcome-1'),
    listCaseOutcomes: vi.fn(async () => []),
    ...overrides,
  };
}

const defaultTemplates = [
  {
    name: 'Security Incident',
    scenario: 'security-incident',
    steps: ['Acknowledge incident', 'Capture scope'],
  },
];

describe('useWorkspaceCatalog', () => {
  it('keeps empty catalogs stable when workspace rail is disabled', async () => {
    const ops = makeOps();
    const { result } = renderHook(() => useWorkspaceCatalog({
      workspaceRailEnabled: false,
      guidedRunbooksEnabled: true,
      workspaceRunbookScopeKey: 'workspace:test',
      defaultRunbookTemplates: defaultTemplates,
      ops,
    }));

    await act(async () => {
      await result.current.refreshWorkspaceCatalog();
    });

    expect(result.current.resolutionKits).toEqual([]);
    expect(result.current.workspaceFavorites).toEqual([]);
    expect(result.current.runbookTemplates).toEqual([]);
    expect(result.current.guidedRunbookSession).toBeNull();
  });

  it('bootstraps default templates when guided runbooks are enabled and none exist yet', async () => {
    const listRunbookTemplates = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        id: 'template-1',
        name: 'Security Incident',
        scenario: 'security-incident',
        steps_json: '["Acknowledge incident","Capture scope"]',
        created_at: '2026-03-24T12:00:00.000Z',
        updated_at: '2026-03-24T12:00:00.000Z',
      } satisfies RunbookTemplateRecord]);
    const saveRunbookTemplate = vi.fn(async () => 'template-1');
    const ops = makeOps({ listRunbookTemplates, saveRunbookTemplate });
    const { result } = renderHook(() => useWorkspaceCatalog({
      workspaceRailEnabled: true,
      guidedRunbooksEnabled: true,
      workspaceRunbookScopeKey: 'workspace:test',
      defaultRunbookTemplates: defaultTemplates,
      ops,
    }));

    await act(async () => {
      await result.current.refreshWorkspaceCatalog();
    });

    expect(saveRunbookTemplate).toHaveBeenCalled();
    expect(result.current.runbookTemplates).toHaveLength(1);
    expect(result.current.runbookTemplates[0]?.scenario).toBe('security-incident');
  });

  it('hydrates an active legacy-scoped runbook session when the current workspace has none yet', async () => {
    const listRunbookSessions = vi.fn(async (_limit?: number, _status?: string, scopeKey?: string) => {
      if (scopeKey === 'legacy:unscoped') {
        return [{
          id: 'session-1',
          scenario: 'security-incident',
          scope_key: 'legacy:unscoped',
          status: 'active',
          steps_json: '["Acknowledge incident","Capture scope"]',
          current_step: 1,
          created_at: '2026-03-24T12:00:00.000Z',
          updated_at: '2026-03-24T12:00:00.000Z',
        } satisfies RunbookSessionRecord];
      }
      return [];
    });
    const listRunbookStepEvidence = vi.fn(async () => [{
      id: 'evidence-1',
      session_id: 'session-1',
      step_index: 0,
      status: 'completed',
      evidence_text: 'Acknowledged incident',
      skip_reason: null,
      created_at: '2026-03-24T12:01:00.000Z',
    } satisfies RunbookStepEvidenceRecord]);
    const ops = makeOps({ listRunbookSessions, listRunbookStepEvidence });
    const { result } = renderHook(() => useWorkspaceCatalog({
      workspaceRailEnabled: true,
      guidedRunbooksEnabled: true,
      workspaceRunbookScopeKey: 'workspace:test',
      defaultRunbookTemplates: defaultTemplates,
      ops,
    }));

    await act(async () => {
      await result.current.refreshWorkspaceCatalog();
    });

    await waitFor(() => {
      expect(result.current.guidedRunbookSession?.id).toBe('session-1');
    });
    expect(result.current.runbookSessionSourceScopeKey).toBe('legacy:unscoped');
    expect(result.current.guidedRunbookSession?.evidence).toHaveLength(1);
  });
});
