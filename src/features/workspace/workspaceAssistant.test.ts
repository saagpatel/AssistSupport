import { describe, expect, it } from 'vitest';
import type { SavedDraft } from '../../types/workspace';
import {
  applyResolutionKit,
  analyzeCaseIntake,
  buildEvidencePack,
  buildHandoffPack,
  buildKbDraft,
  buildNextActions,
  buildResolutionKitFromWorkspace,
  buildSimilarCases,
  parseCaseIntake,
  toGuidedRunbookSession,
  toResolutionKit,
  toWorkspaceFavorite,
  serializeCaseIntake,
} from './workspaceAssistant';

function makeDraft(partial: Partial<SavedDraft> = {}): SavedDraft {
  return {
    id: partial.id ?? crypto.randomUUID(),
    input_text: partial.input_text ?? 'VPN disconnects every morning for remote users',
    summary_text: partial.summary_text ?? 'VPN disconnects every morning',
    diagnosis_json: partial.diagnosis_json ?? null,
    response_text: partial.response_text ?? 'Reset the VPN profile and verify MFA enrollment.',
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

describe('workspaceAssistant', () => {
  it('analyzes structured intake from ticket-style prompts', () => {
    const intake = analyzeCaseIntake(
      [
        'Incident triage context:',
        '- Customer/business impact: Remote team cannot authenticate',
        '- Scope (users/systems/regions): 17 users / VPN / west region',
        '- Actions already attempted: restarted client, reset MFA, reprovisioned profile',
        '- Current blocker / escalation needed: still fails after MFA reset',
      ].join('\n'),
      {
        key: 'INC-1001',
        summary: 'VPN login failures for west region',
        description: 'Users are disconnected every morning',
        status: 'Open',
        priority: 'High',
        assignee: null,
        reporter: 'alex',
        created: '2026-03-10T10:00:00.000Z',
        updated: '2026-03-10T10:00:00.000Z',
        issue_type: 'Incident',
      },
    );

    expect(intake.issue).toContain('VPN login failures');
    expect(intake.impact).toContain('Remote team cannot authenticate');
    expect(intake.steps_tried).toContain('restarted client');
    expect(intake.blockers).toContain('still fails after MFA reset');
    expect(intake.urgency).toBe('high');
  });

  it('preserves defaults when intake json is invalid', () => {
    const intake = parseCaseIntake('{not-json');
    expect(intake.note_audience).toBe('internal-note');
    expect(intake.urgency).toBe('normal');
    expect(intake.missing_data).toEqual([]);
  });

  it('serializes intake with refreshed missing data', () => {
    const json = serializeCaseIntake({
      issue: 'Laptop cannot connect to Wi-Fi',
      affected_system: 'Corporate Wi-Fi',
      steps_tried: 'Restarted network stack',
      note_audience: 'customer-safe',
    });

    expect(json).not.toBeNull();
    const parsed = JSON.parse(json ?? '{}');
    expect(parsed.note_audience).toBe('customer-safe');
    expect(parsed.missing_data).toContain('customer or business impact');
  });

  it('recommends clarify before answer when critical data is missing', () => {
    const actions = buildNextActions({
      inputText: 'Need help with VPN',
      responseText: '',
      intake: {
        issue: 'Need help with VPN',
        note_audience: 'internal-note',
      },
      sources: [],
    });

    expect(actions[0]?.kind).toBe('clarify');
    expect(actions[0]?.prerequisites.length).toBeGreaterThan(0);
  });

  it('prioritizes policy and approval guidance for policy-heavy tickets', () => {
    const actions = buildNextActions({
      inputText: 'Can I install personal software without approval?',
      responseText: '',
      intake: {
        issue: 'Personal software request',
        impact: 'User blocked on tooling',
        affected_system: 'Managed laptop',
        steps_tried: 'Checked portal',
        blockers: 'Unsure whether policy allows it',
        note_audience: 'internal-note',
      },
      sources: [],
    });

    expect(actions.some((action) => action.kind === 'approval')).toBe(true);
  });

  it('surfaces finalized similar cases with explainability', () => {
    const similar = buildSimilarCases({
      currentDraftId: 'current',
      queryText: 'VPN disconnects morning remote users',
      drafts: [
        makeDraft({
          id: 'old-1',
          status: 'finalized',
          handoff_summary: 'Escalated after repeated MFA issues',
          input_text: 'Remote users report VPN disconnects every morning after sign-in',
        }),
        makeDraft({
          id: 'old-2',
          status: 'draft',
          input_text: 'Printer jam on second floor',
        }),
      ],
    });

    expect(similar).toHaveLength(1);
    expect(similar[0].draft_id).toBe('old-1');
    expect(similar[0].explanation.summary).toContain('Matched on');
  });

  it('builds evidence and KB drafts from the active workspace state', () => {
    const draft = makeDraft();
    const handoff = buildHandoffPack({
      inputText: draft.input_text,
      responseText: draft.response_text ?? '',
      intake: {
        issue: 'VPN disconnects every morning',
        impact: 'Remote team cannot work for 20 minutes',
        affected_system: 'VPN gateway',
        steps_tried: 'Reset VPN profile',
        blockers: 'Still failing for one region',
        note_audience: 'internal-note',
      },
      diagnosticNotes: 'Reproduced on west region laptops.',
      sources: [],
    });

    const evidence = buildEvidencePack({
      draft,
      intake: {
        issue: 'VPN disconnects every morning',
        impact: 'Remote team cannot work for 20 minutes',
        affected_system: 'VPN gateway',
        steps_tried: 'Reset VPN profile',
        blockers: 'Still failing for one region',
        note_audience: 'internal-note',
      },
      handoffPack: handoff,
      nextActions: [],
      sources: [],
    });
    const kbDraft = buildKbDraft({
      draft,
      intake: {
        issue: 'VPN disconnects every morning',
        environment: 'Managed Windows laptops',
        blockers: 'West region gateway still unstable',
        note_audience: 'internal-note',
      },
      handoffPack: handoff,
      sources: [],
    });

    expect(evidence.title).toContain('INC-1001');
    expect(evidence.sections.some((section) => section.label === 'Current Handoff Pack')).toBe(true);
    expect(kbDraft.title).toContain('VPN disconnects every morning');
    expect(kbDraft.warnings.length).toBe(1);
  });

  it('builds and applies reusable resolution kits from the workspace', () => {
    const draft = makeDraft({ response_text: 'Reset the VPN profile and re-enroll MFA.' });
    const handoff = buildHandoffPack({
      inputText: draft.input_text,
      responseText: draft.response_text ?? '',
      intake: {
        issue: 'VPN disconnects every morning',
        impact: 'Remote users cannot connect for the first 15 minutes of the day',
        affected_system: 'VPN gateway',
        steps_tried: 'Reset VPN profile',
        blockers: 'One region still affected',
        likely_category: 'incident',
        note_audience: 'internal-note',
      },
      diagnosticNotes: 'Escalated to network engineering for west region gateway checks.',
      sources: [
        {
          chunk_id: 'chunk-1',
          document_id: 'doc-1',
          file_path: '/mock/kb/vpn.md',
          title: 'VPN Runbook',
          heading_path: null,
          score: 0.9,
          search_method: 'fts',
          source_type: 'file',
        },
      ],
    });
    const kbDraft = buildKbDraft({
      draft,
      intake: {
        issue: 'VPN disconnects every morning',
        environment: 'Managed Windows laptops',
        blockers: 'One region still affected',
        likely_category: 'incident',
        note_audience: 'internal-note',
      },
      handoffPack: handoff,
      sources: [],
    });

    const kit = buildResolutionKitFromWorkspace({
      intake: {
        issue: 'VPN disconnects every morning',
        blockers: 'One region still affected',
        likely_category: 'incident',
        note_audience: 'internal-note',
      },
      kbDraft,
      responseText: draft.response_text ?? '',
      sources: [
        {
          chunk_id: 'chunk-1',
          document_id: 'doc-1',
          file_path: '/mock/kb/vpn.md',
          title: 'VPN Runbook',
          heading_path: null,
          score: 0.9,
          search_method: 'fts',
          source_type: 'file',
        },
      ],
    });

    const applied = applyResolutionKit({
      currentInput: draft.input_text,
      currentResponse: '',
      currentIntake: { note_audience: 'internal-note' },
      kit: { id: 'kit-1', ...kit },
    });

    expect(kit.category).toBe('incident');
    expect(kit.kb_document_ids).toContain('doc-1');
    expect(applied.responseText).toContain('Reset the VPN profile');
    expect(applied.checklistText).toContain('Resolution kit checklist');
  });

  it('hydrates saved records into workspace-friendly models', () => {
    const kit = toResolutionKit({
      id: 'kit-1',
      name: 'Access Review',
      summary: 'Use for routine access checks.',
      category: 'access',
      response_template: 'We are reviewing the access request.',
      checklist_items_json: JSON.stringify(['Confirm requester', 'Verify approver']),
      kb_document_ids_json: JSON.stringify(['doc-2']),
      runbook_scenario: 'access-request',
      approval_hint: 'Manager approval required',
      created_at: '2026-03-10T10:00:00.000Z',
      updated_at: '2026-03-10T10:00:00.000Z',
    });
    const favorite = toWorkspaceFavorite({
      id: 'favorite-1',
      kind: 'kit',
      label: 'Access Review',
      resource_id: 'kit-1',
      metadata_json: JSON.stringify({ category: 'access' }),
      created_at: '2026-03-10T10:00:00.000Z',
      updated_at: '2026-03-10T10:00:00.000Z',
    });
    const session = toGuidedRunbookSession(
      {
        id: 'runbook-1',
        scenario: 'access-request',
        status: 'active',
        steps_json: JSON.stringify(['Check requester', 'Verify approver']),
        current_step: 1,
        created_at: '2026-03-10T10:00:00.000Z',
        updated_at: '2026-03-10T10:00:00.000Z',
      },
      [
        {
          id: 'evidence-1',
          session_id: 'runbook-1',
          step_index: 0,
          status: 'completed',
          evidence_text: 'Requester confirmed via HR record.',
          skip_reason: null,
          created_at: '2026-03-10T10:01:00.000Z',
        },
      ],
    );

    expect(kit.checklist_items).toContain('Verify approver');
    expect(favorite.metadata?.category).toBe('access');
    expect(session.steps[1]).toBe('Verify approver');
    expect(session.evidence[0].status).toBe('completed');
  });
});
