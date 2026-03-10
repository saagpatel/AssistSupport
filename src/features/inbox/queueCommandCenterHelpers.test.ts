import { describe, expect, it } from 'vitest';
import type { SavedDraft, TriageClusterRecord } from '../../types';
import type { QueueItem } from './queueModel';
import {
  appendQueueDispatchHistory,
  buildQueueCoachingSnapshot,
  buildQueueDispatchPreview,
  buildQueueHandoffPackText,
  formatBatchTriageOutput,
  matchesQueueFocusFilter,
  parseBatchTriageInput,
} from './queueCommandCenterHelpers';
import { buildQueueHandoffSnapshot } from './queueModel';

function makeDraft(partial: Partial<SavedDraft> = {}): SavedDraft {
  return {
    id: partial.id ?? 'draft-1',
    input_text: partial.input_text ?? 'VPN outage for west region users',
    summary_text: partial.summary_text ?? 'VPN outage',
    diagnosis_json: partial.diagnosis_json ?? null,
    response_text: partial.response_text ?? 'Escalated to network team.',
    ticket_id: partial.ticket_id ?? 'INC-1001',
    kb_sources_json: partial.kb_sources_json ?? null,
    created_at: partial.created_at ?? '2026-03-10T10:00:00.000Z',
    updated_at: partial.updated_at ?? '2026-03-10T10:00:00.000Z',
    is_autosave: partial.is_autosave ?? false,
    model_name: partial.model_name ?? 'Local Model',
    case_intake_json: partial.case_intake_json ?? null,
    status: partial.status ?? 'draft',
    handoff_summary: partial.handoff_summary ?? null,
    finalized_at: partial.finalized_at ?? null,
    finalized_by: partial.finalized_by ?? null,
  };
}

function makeQueueItem(partial: Partial<QueueItem> = {}): QueueItem {
  return {
    draft: partial.draft ?? makeDraft(),
    meta: partial.meta ?? {
      owner: 'unassigned',
      priority: 'high',
      state: 'open',
      updatedAt: '2026-03-10T10:00:00.000Z',
    },
    slaDueAt: partial.slaDueAt ?? '2026-03-10T14:00:00.000Z',
    isAtRisk: partial.isAtRisk ?? false,
  };
}

describe('queueCommandCenterHelpers', () => {
  it('parses batch triage input and formats cluster output', () => {
    const tickets = parseBatchTriageInput('INC-1001|VPN outage\nPrinter jam on floor 2');
    const output = formatBatchTriageOutput([
      { cluster_key: 'vpn', summary: 'VPN access issues', ticket_ids: ['INC-1001'] },
    ]);

    expect(tickets).toHaveLength(2);
    expect(tickets[0]).toEqual({ id: 'INC-1001', summary: 'VPN outage' });
    expect(tickets[1]).toEqual({ id: 'ticket-2', summary: 'Printer jam on floor 2' });
    expect(output).toContain('VPN access issues');
    expect(output).toContain('INC-1001');
  });

  it('matches policy-heavy and missing-context filters', () => {
    const policyItem = makeQueueItem({
      draft: makeDraft({
        input_text: 'Need approval for admin software installation',
        case_intake_json: JSON.stringify({
          issue: 'Software install request',
          missing_data: ['customer or business impact'],
          note_audience: 'internal-note',
        }),
      }),
    });

    expect(matchesQueueFocusFilter(policyItem, 'policy-heavy')).toBe(true);
    expect(matchesQueueFocusFilter(policyItem, 'approval-heavy')).toBe(true);
    expect(matchesQueueFocusFilter(policyItem, 'missing-context')).toBe(true);
  });

  it('builds coaching signals from queue risk and repeated clusters', () => {
    const triageHistory: TriageClusterRecord[] = [
      {
        id: 'cluster-1',
        cluster_key: 'vpn',
        summary: 'Recurring VPN outage for west region',
        ticket_count: 3,
        tickets_json: '[]',
        created_at: '2026-03-10T10:00:00.000Z',
      },
    ];

    const snapshot = buildQueueCoachingSnapshot([
      makeQueueItem({
        isAtRisk: true,
        draft: makeDraft({
          input_text: 'VPN outage again for west region users',
          case_intake_json: JSON.stringify({
            issue: 'VPN outage',
            missing_data: ['affected system'],
            note_audience: 'internal-note',
          }),
        }),
      }),
      makeQueueItem({
        draft: makeDraft({
          id: 'draft-2',
          input_text: 'Access request pending approval',
          ticket_id: 'REQ-1002',
        }),
      }),
    ], triageHistory);

    expect(snapshot.repeatedIncidentCount).toBeGreaterThan(0);
    expect(snapshot.missingContextCount).toBeGreaterThan(0);
    expect(snapshot.signals.some((signal) => signal.id === 'at-risk-load')).toBe(true);
    expect(snapshot.score).toBeLessThan(100);
  });

  it('builds handoff text and collaboration previews', () => {
    const items = [
      makeQueueItem({
        isAtRisk: true,
        draft: makeDraft({ ticket_id: 'INC-1001', summary_text: 'VPN outage', handoff_summary: 'Escalated to network team' }),
      }),
    ];
    const snapshot = buildQueueHandoffSnapshot(items, '2026-03-10T12:00:00.000Z');
    const handoff = buildQueueHandoffPackText(snapshot, null);
    const preview = buildQueueDispatchPreview(items[0], 'slack');

    expect(handoff).toContain('Shift Handoff');
    expect(handoff).toContain('Top at-risk tickets');
    expect(preview.destination_label).toContain('Slack');
    expect(preview.payload_preview).toContain('INC-1001');
  });

  it('persists local dispatch history entries', () => {
    const storage = (() => {
      const state = new Map<string, string>();
      return {
        getItem: (key: string) => state.get(key) ?? null,
        setItem: (key: string, value: string) => {
          state.set(key, value);
        },
      };
    })();

    const item = makeQueueItem();
    const preview = buildQueueDispatchPreview(item, 'jira');
    const history = appendQueueDispatchHistory(preview, item, storage);

    expect(history).toHaveLength(1);
    expect(history[0].integration_type).toBe('jira');
    expect(history[0].ticket_label).toBe('INC-1001');
  });
});
