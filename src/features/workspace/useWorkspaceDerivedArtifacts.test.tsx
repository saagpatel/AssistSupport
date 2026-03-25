// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useWorkspaceDerivedArtifacts } from './useWorkspaceDerivedArtifacts';

describe('useWorkspaceDerivedArtifacts', () => {
  it('returns a stable empty-state workspace snapshot when no intake or response data exists', () => {
    const { result } = renderHook(() => useWorkspaceDerivedArtifacts({
      structuredIntakeEnabled: true,
      nextBestActionEnabled: true,
      input: '',
      response: '',
      diagnosticNotes: '',
      sources: [],
      caseIntake: { note_audience: 'internal-note' },
      currentTicket: null,
      currentTicketId: null,
      savedDraftId: null,
      autosaveDraftId: null,
      savedDraftCreatedAt: null,
      loadedModelName: null,
      buildDiagnosisJson: () => null,
      handoffTouched: false,
      guidedRunbookNote: '',
      guidedRunbookSession: null,
      runbookSessionTouched: false,
      runbookSessionSourceScopeKey: null,
      workspaceRunbookScopeKey: 'workspace:test',
      checklistItems: [],
      checklistCompleted: {},
      firstResponse: '',
      originalResponse: '',
    }));

    expect(result.current.activeWorkspaceDraft.id).toBe('workspace-draft');
    expect(result.current.hasLiveWorkspaceContent).toBe(false);
    expect(result.current.hasSaveableWorkspaceContent).toBe(false);
    expect(result.current.missingQuestions.length).toBeGreaterThan(0);
    expect(result.current.nextActions.some((item) => item.kind === 'clarify')).toBe(true);
  });

  it('derives next actions for structured incident intake before a response exists', () => {
    const { result } = renderHook(() => useWorkspaceDerivedArtifacts({
      structuredIntakeEnabled: true,
      nextBestActionEnabled: true,
      input: 'Critical outage affecting VPN users',
      response: '',
      diagnosticNotes: 'Investigating firewall changes',
      sources: [],
      caseIntake: {
        issue: 'VPN outage',
        affected_system: 'VPN gateway',
        impact: 'Many users offline',
        steps_tried: 'Restarted edge service',
        note_audience: 'internal-note',
      },
      currentTicket: {
        id: '100',
        key: 'INC-100',
        summary: 'VPN outage',
        description: 'critical outage on gateway',
        status: 'Open',
        priority: 'High',
        assignee: null,
        reporter: null,
        labels: [],
        created_at: null,
        updated_at: null,
      },
      currentTicketId: 'INC-100',
      savedDraftId: 'draft-1',
      autosaveDraftId: null,
      savedDraftCreatedAt: '2026-03-24T12:00:00.000Z',
      loadedModelName: 'Local Model',
      buildDiagnosisJson: () => JSON.stringify({ notes: 'Investigating firewall changes' }),
      handoffTouched: false,
      guidedRunbookNote: '',
      guidedRunbookSession: null,
      runbookSessionTouched: false,
      runbookSessionSourceScopeKey: null,
      workspaceRunbookScopeKey: 'workspace:test',
      checklistItems: [],
      checklistCompleted: {},
      firstResponse: '',
      originalResponse: '',
    }));

    const kinds = result.current.nextActions.map((item) => item.kind);
    expect(kinds).toContain('runbook');
    expect(kinds).toContain('escalate');
    expect(kinds).toContain('clarify');
    expect(result.current.handoffPack.summary).toContain('VPN outage');
  });

  it('captures edit ratio and KB promotion signals once a response has been changed without sources', () => {
    const { result } = renderHook(() => useWorkspaceDerivedArtifacts({
      structuredIntakeEnabled: true,
      nextBestActionEnabled: true,
      input: 'Need policy guidance',
      response: 'Updated answer with local notes',
      diagnosticNotes: '',
      sources: [],
      caseIntake: {
        issue: 'Need policy guidance',
        affected_system: 'Admin tools',
        impact: 'User blocked',
        steps_tried: 'Checked local notes',
        note_audience: 'internal-note',
      },
      currentTicket: null,
      currentTicketId: null,
      savedDraftId: 'draft-1',
      autosaveDraftId: null,
      savedDraftCreatedAt: '2026-03-24T12:00:00.000Z',
      loadedModelName: 'Local Model',
      buildDiagnosisJson: () => null,
      handoffTouched: true,
      guidedRunbookNote: '',
      guidedRunbookSession: null,
      runbookSessionTouched: false,
      runbookSessionSourceScopeKey: null,
      workspaceRunbookScopeKey: 'workspace:test',
      checklistItems: [{ id: 'step-1' }],
      checklistCompleted: { 'step-1': true },
      firstResponse: '',
      originalResponse: 'Original answer',
    }));

    expect(result.current.responseEditRatio).toBeGreaterThan(0);
    expect(result.current.checklistCompletedCount).toBe(1);
    expect(result.current.nextActions.some((item) => item.kind === 'promote_kb')).toBe(true);
  });
});
