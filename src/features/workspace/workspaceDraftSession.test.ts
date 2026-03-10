import { describe, expect, it, vi } from 'vitest';
import {
  hasMeaningfulWorkspaceDraftContent,
  resolveLoadedWorkspaceDraftState,
  resolveVisibleRunbookScopeKey,
  resolveWorkspaceAutosaveState,
  shouldProceedAfterSaveAttempt,
} from './workspaceDraftSession';

describe('workspaceDraftSession', () => {
  it('creates a stable autosave id for an unsaved workspace with content', () => {
    const createDraftId = vi.fn(() => 'autosave-1');

    const state = resolveWorkspaceAutosaveState({
      hasMeaningfulContent: true,
      savedDraftId: null,
      autosaveDraftId: null,
      createDraftId,
    });

    expect(state).toEqual({
      stateAutosaveDraftId: 'autosave-1',
      autosaveRecordId: 'autosave-1',
    });
    expect(createDraftId).toHaveBeenCalledTimes(1);
  });

  it('reuses an existing autosave id instead of generating a new one', () => {
    const createDraftId = vi.fn(() => 'autosave-new');

    const state = resolveWorkspaceAutosaveState({
      hasMeaningfulContent: true,
      savedDraftId: null,
      autosaveDraftId: 'autosave-existing',
      createDraftId,
    });

    expect(state).toEqual({
      stateAutosaveDraftId: 'autosave-existing',
      autosaveRecordId: 'autosave-existing',
    });
    expect(createDraftId).not.toHaveBeenCalled();
  });

  it('keeps autosaves separate from the saved draft id and skips empty autosave work', () => {
    const createDraftId = vi.fn(() => 'autosave-new');

    expect(resolveWorkspaceAutosaveState({
      hasMeaningfulContent: true,
      savedDraftId: 'draft-123',
      autosaveDraftId: null,
      createDraftId,
    })).toEqual({
      stateAutosaveDraftId: 'autosave-new',
      autosaveRecordId: 'autosave-new',
    });

    expect(resolveWorkspaceAutosaveState({
      hasMeaningfulContent: true,
      savedDraftId: 'draft-123',
      autosaveDraftId: 'autosave-existing',
      createDraftId,
    })).toEqual({
      stateAutosaveDraftId: 'autosave-existing',
      autosaveRecordId: 'autosave-existing',
    });

    expect(resolveWorkspaceAutosaveState({
      hasMeaningfulContent: false,
      savedDraftId: null,
      autosaveDraftId: 'autosave-existing',
      createDraftId,
    })).toEqual({
      stateAutosaveDraftId: 'autosave-existing',
      autosaveRecordId: null,
    });
  });

  it('blocks save-and-open when the save attempt did not return a draft id', () => {
    expect(shouldProceedAfterSaveAttempt('save-and-open', null)).toBe(false);
    expect(shouldProceedAfterSaveAttempt('save-and-open', 'draft-123')).toBe(true);
    expect(shouldProceedAfterSaveAttempt('replace', null)).toBe(true);
    expect(shouldProceedAfterSaveAttempt('compare', null)).toBe(true);
  });

  it('treats structured workspace progress as meaningful even when the input box is blank', () => {
    expect(hasMeaningfulWorkspaceDraftContent({
      inputText: '   ',
      responseText: '',
      diagnosisJson: '{"notes":"Checked MFA enrollment"}',
      caseIntake: null,
      handoffTouched: false,
    })).toBe(true);

    expect(hasMeaningfulWorkspaceDraftContent({
      inputText: '   ',
      responseText: '',
      diagnosisJson: null,
      caseIntake: { issue: 'VPN outage', note_audience: 'internal-note' },
      handoffTouched: false,
    })).toBe(true);

    expect(hasMeaningfulWorkspaceDraftContent({
      inputText: '   ',
      responseText: '',
      diagnosisJson: null,
      caseIntake: null,
      handoffTouched: true,
    })).toBe(true);
  });

  it('still treats a truly empty workspace as empty', () => {
    expect(hasMeaningfulWorkspaceDraftContent({
      inputText: '   ',
      responseText: '   ',
      diagnosisJson: null,
      caseIntake: {
        urgency: 'normal',
        missing_data: [],
        note_audience: 'internal-note',
        custom_fields: {},
      },
      handoffTouched: false,
    })).toBe(false);
  });

  it('treats guided runbook state as meaningful workspace progress', () => {
    expect(hasMeaningfulWorkspaceDraftContent({
      inputText: '   ',
      responseText: '',
      diagnosisJson: null,
      caseIntake: null,
      handoffTouched: false,
      hasGuidedRunbookState: true,
    })).toBe(true);
  });

  it('keeps loaded autosaves separate from real saved drafts', () => {
    expect(resolveLoadedWorkspaceDraftState('autosave-1', true)).toEqual({
      savedDraftId: null,
      autosaveDraftId: 'autosave-1',
      workspaceRunbookScopeKey: 'draft:autosave-1',
    });

    expect(resolveLoadedWorkspaceDraftState('draft-1', false)).toEqual({
      savedDraftId: 'draft-1',
      autosaveDraftId: null,
      workspaceRunbookScopeKey: 'draft:draft-1',
    });
  });

  it('uses the legacy runbook scope only when the visible session comes from the fallback store', () => {
    expect(resolveVisibleRunbookScopeKey('workspace:123', true, false)).toBe('workspace:123');
    expect(resolveVisibleRunbookScopeKey('workspace:123', false, false)).toBe('workspace:123');
    expect(resolveVisibleRunbookScopeKey('workspace:123', false, true)).toBe('legacy:unscoped');
  });
});
