// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAppShellState } from './useAppShellState';
import type { DraftTabHandle } from '../../components/Draft/DraftTab';
import type { SavedDraft } from '../../types/workspace';
import type { RefObject } from 'react';

function makeDraft(partial: Partial<SavedDraft> = {}): SavedDraft {
  return {
    id: partial.id ?? 'draft-1',
    input_text: partial.input_text ?? 'Customer cannot connect',
    summary_text: partial.summary_text ?? 'Connection issue',
    diagnosis_json: partial.diagnosis_json ?? null,
    response_text: partial.response_text ?? 'We are checking the issue.',
    ticket_id: partial.ticket_id ?? 'INC-123',
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

afterEach(() => {
  localStorage.clear();
});

describe('useAppShellState', () => {
  it('routes workspace search pivots into Knowledge and consumes the pending query once', () => {
    const draftRef = { current: null } as RefObject<DraftTabHandle | null>;
    const { result } = renderHook(() => useAppShellState({
      initIsFirstRun: false,
      draftRef,
      addToast: vi.fn(),
    }));

    act(() => {
      result.current.handleNavigateToSource('vpn policy');
    });

    expect(result.current.activeTab).toBe('knowledge');
    expect(result.current.sourceSearchQuery).toBe('vpn policy');

    act(() => {
      result.current.consumeSourceSearchQuery();
    });

    expect(result.current.sourceSearchQuery).toBeNull();
  });

  it('routes workspace queue pivots into Queue and consumes the pending queue view once', () => {
    const draftRef = { current: null } as RefObject<DraftTabHandle | null>;
    const { result } = renderHook(() => useAppShellState({
      initIsFirstRun: false,
      draftRef,
      addToast: vi.fn(),
    }));

    act(() => {
      result.current.handleNavigateToQueue('at_risk');
    });

    expect(result.current.activeTab).toBe('followups');
    expect(result.current.pendingQueueView).toBe('at_risk');

    act(() => {
      result.current.consumePendingQueueView();
    });

    expect(result.current.pendingQueueView).toBeNull();
  });

  it('loads drafts immediately on the workspace tab and defers then applies them when coming from another tab', async () => {
    const loadDraft = vi.fn();
    const draftRef = {
      current: {
        loadDraft,
      } as Pick<DraftTabHandle, 'loadDraft'> as DraftTabHandle,
    } as RefObject<DraftTabHandle | null>;
    const draft = makeDraft();
    const { result } = renderHook(() => useAppShellState({
      initIsFirstRun: false,
      draftRef,
      addToast: vi.fn(),
    }));

    act(() => {
      result.current.handleLoadDraft(draft);
    });

    expect(loadDraft).toHaveBeenCalledWith(draft);

    act(() => {
      result.current.setActiveTab('knowledge');
    });

    act(() => {
      result.current.handleLoadDraft(draft);
    });

    expect(result.current.activeTab).toBe('draft');

    await waitFor(() => {
      expect(loadDraft).toHaveBeenCalledTimes(2);
    });
  });
});
