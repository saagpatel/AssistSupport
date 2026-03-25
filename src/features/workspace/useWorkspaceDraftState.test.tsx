// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkspaceDraftState } from './useWorkspaceDraftState';
import type { SavedDraft } from '../../types/workspace';

const invokeMock = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

function makeDraft(partial: Partial<SavedDraft> = {}): SavedDraft {
  return {
    id: partial.id ?? 'draft-1',
    input_text: partial.input_text ?? 'VPN outage',
    summary_text: partial.summary_text ?? 'VPN outage',
    diagnosis_json: partial.diagnosis_json ?? null,
    response_text: partial.response_text ?? 'Investigating now',
    ticket_id: partial.ticket_id ?? 'INC-100',
    kb_sources_json: partial.kb_sources_json ?? null,
    created_at: partial.created_at ?? '2026-03-24T12:00:00.000Z',
    updated_at: partial.updated_at ?? '2026-03-24T12:00:00.000Z',
    is_autosave: partial.is_autosave ?? false,
    model_name: partial.model_name ?? 'Local Model',
    case_intake_json: partial.case_intake_json ?? null,
    status: partial.status ?? 'draft',
    handoff_summary: partial.handoff_summary ?? null,
    finalized_at: partial.finalized_at ?? null,
    finalized_by: partial.finalized_by ?? null,
  };
}

function makeParams(overrides: Partial<Parameters<typeof useWorkspaceDraftState>[0]> = {}) {
  return {
    workspacePersonalizationStorageKey: 'assistsupport.workspace.personalization.test',
    workspacePersonalization: {
      preferred_note_audience: 'internal-note',
      preferred_output_length: 'Medium',
      favorite_queue_view: 'all',
      default_evidence_format: 'clipboard',
    },
    savedDraftId: null,
    setSavedDraftId: vi.fn(),
    setSavedDraftCreatedAt: vi.fn(),
    autosaveDraftId: null,
    setAutosaveDraftId: vi.fn(),
    workspaceRunbookScopeKey: 'workspace:test',
    setWorkspaceRunbookScopeKey: vi.fn(),
    runbookSessionSourceScopeKey: null,
    setRunbookSessionSourceScopeKey: vi.fn(),
    runbookSessionTouched: false,
    setRunbookSessionTouched: vi.fn(),
    guidedRunbookSession: null,
    setGuidedRunbookNote: vi.fn(),
    hasLiveWorkspaceContent: false,
    hasSaveableWorkspaceContent: false,
    currentTicket: null,
    currentTicketId: null,
    input: '',
    response: '',
    sources: [],
    loadedModelName: 'Local Model',
    serializedCaseIntake: null,
    handoffPack: {
      summary: 'VPN outage',
      actions_taken: [],
      current_blocker: 'Unknown',
      next_step: 'Investigate',
      customer_safe_update: 'Investigating',
      escalation_note: 'Investigating',
    },
    buildDiagnosisJson: () => null,
    triggerAutosave: vi.fn(),
    cancelAutosave: vi.fn(),
    reassignRunbookSessionScope: vi.fn(async () => undefined),
    reassignRunbookSessionById: vi.fn(async () => undefined),
    preferredNoteAudience: 'internal-note' as const,
    setInput: vi.fn(),
    setResponse: vi.fn(),
    setOriginalResponse: vi.fn(),
    setIsResponseEdited: vi.fn(),
    setDiagnosticNotes: vi.fn(),
    setTreeResult: vi.fn(),
    setChecklistItems: vi.fn(),
    setChecklistCompleted: vi.fn(),
    setChecklistError: vi.fn(),
    setFirstResponse: vi.fn(),
    setFirstResponseTone: vi.fn(),
    setApprovalQuery: vi.fn(),
    setApprovalSummary: vi.fn(),
    setApprovalSources: vi.fn(),
    setApprovalResults: vi.fn(),
    setApprovalError: vi.fn(),
    setConfidence: vi.fn(),
    setGrounding: vi.fn(),
    setCurrentTicketId: vi.fn(),
    setCurrentTicket: vi.fn(),
    setSources: vi.fn(),
    setCaseIntake: vi.fn(),
    setHandoffTouched: vi.fn(),
    setCompareCase: vi.fn(),
    setOcrText: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  invokeMock.mockReset();
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe('useWorkspaceDraftState', () => {
  it('persists workspace personalization and applies a loaded draft immediately when the workspace is empty', async () => {
    invokeMock.mockResolvedValue({
      id: '100',
      key: 'INC-100',
      summary: 'VPN outage',
      description: 'Gateway issue',
      status: 'Open',
      priority: 'High',
      assignee: null,
      reporter: null,
      labels: [],
      created_at: null,
      updated_at: null,
    });
    const params = makeParams();
    const { result } = renderHook(() => useWorkspaceDraftState(params));
    const draft = makeDraft({
      diagnosis_json: JSON.stringify({
        notes: 'Investigating firewall change',
        checklist: {
          items: [{ id: 'step-1', label: 'Check gateway' }],
          completed_ids: ['step-1'],
        },
      }),
      case_intake_json: JSON.stringify({ issue: 'VPN outage' }),
      kb_sources_json: JSON.stringify([{ title: 'VPN runbook', file_path: 'vpn.md' }]),
    });

    act(() => {
      result.current.handleLoadDraft(draft);
    });

    await waitFor(() => {
      expect(params.setInput).toHaveBeenCalledWith('VPN outage');
    });
    expect(localStorage.getItem('assistsupport.workspace.personalization.test')).toContain('"preferred_note_audience":"internal-note"');
    expect(params.setChecklistCompleted).toHaveBeenCalledWith({ 'step-1': true });
    expect(params.setCurrentTicket).toHaveBeenCalled();
  });

  it('queues a draft open instead of replacing meaningful in-progress workspace content immediately', () => {
    const params = makeParams({
      savedDraftId: 'draft-live',
      hasLiveWorkspaceContent: true,
    });
    const { result } = renderHook(() => useWorkspaceDraftState(params));
    const draft = makeDraft({ id: 'draft-other' });

    act(() => {
      result.current.handleLoadDraft(draft);
    });

    expect(result.current.pendingDraftOpen?.id).toBe('draft-other');
    expect(params.setInput).not.toHaveBeenCalled();
  });

  it('creates or updates autosave identity and migrates runbook scope when an autosave-only workspace becomes active', async () => {
    const setAutosaveDraftId = vi.fn();
    const reassignRunbookSessionScope = vi.fn(async () => undefined);
    renderHook(() => useWorkspaceDraftState(makeParams({
      hasSaveableWorkspaceContent: true,
      autosaveDraftId: 'autosave-1',
      setAutosaveDraftId,
      buildDiagnosisJson: () => JSON.stringify({ notes: 'In progress' }),
      input: 'VPN outage',
      response: 'Investigating',
      currentTicketId: 'INC-100',
      reassignRunbookSessionScope,
    })));

    await waitFor(() => {
      expect(reassignRunbookSessionScope).toHaveBeenCalledWith('workspace:test', 'draft:autosave-1');
    });
  });
});
