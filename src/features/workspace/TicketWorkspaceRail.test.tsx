// @vitest-environment jsdom
import type { ComponentProps } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TicketWorkspaceRail } from './TicketWorkspaceRail';
import type {
  CaseIntake,
  GuidedRunbookSession,
  GuidedRunbookTemplate,
  ResolutionKit,
  SimilarCase,
  WorkspaceFavorite,
  WorkspacePersonalization,
} from '../../types';

const baseIntake: CaseIntake = {
  issue: 'VPN disconnects every morning',
  impact: 'Remote team loses access at shift start',
  affected_system: 'VPN gateway',
  steps_tried: 'Reset profile',
  blockers: 'West region still affected',
  note_audience: 'internal-note',
  missing_data: [],
};

const baseSimilarCase: SimilarCase = {
  draft_id: 'draft-1',
  ticket_id: 'INC-1001',
  title: 'VPN outage follow-up',
  excerpt: 'VPN disconnects every morning for remote users',
  response_excerpt: 'Reset the VPN profile and verify MFA enrollment.',
  response_text: 'Reset the VPN profile and verify MFA enrollment.',
  handoff_summary: 'Escalated to network team',
  status: 'finalized',
  updated_at: '2026-03-10T10:00:00.000Z',
  match_score: 0.92,
  explanation: {
    summary: 'Matched on vpn, disconnects, remote.',
    matched_terms: ['vpn', 'disconnects', 'remote'],
    reasons: ['Previous case was finalized.'],
    authoritative: true,
  },
};

const baseResolutionKit: ResolutionKit = {
  id: 'kit-1',
  name: 'VPN Incident Starter',
  summary: 'Use for repeated VPN incidents.',
  category: 'incident',
  response_template: 'We are reviewing the VPN incident.',
  checklist_items: ['Confirm scope', 'Check recent network changes'],
  kb_document_ids: ['doc-1'],
  runbook_scenario: 'security-incident',
  approval_hint: null,
};

const baseRunbookTemplate: GuidedRunbookTemplate = {
  id: 'runbook-template-1',
  name: 'Security Incident',
  scenario: 'security-incident',
  steps: ['Acknowledge incident', 'Contain access'],
};

const baseRunbookSession: GuidedRunbookSession = {
  id: 'runbook-session-1',
  scenario: 'security-incident',
  status: 'active',
  steps: ['Acknowledge incident', 'Contain access'],
  current_step: 1,
  evidence: [
    {
      id: 'evidence-1',
      session_id: 'runbook-session-1',
      step_index: 0,
      status: 'completed',
      evidence_text: 'Incident acknowledged in Slack.',
      skip_reason: null,
      created_at: '2026-03-10T10:01:00.000Z',
    },
  ],
};

const baseFavorites: WorkspaceFavorite[] = [
  {
    id: 'favorite-1',
    kind: 'kit',
    label: 'VPN Incident Starter',
    resource_id: 'kit-1',
    metadata: { category: 'incident' },
  },
];

const basePersonalization: WorkspacePersonalization = {
  preferred_note_audience: 'internal-note',
  preferred_output_length: 'Medium',
  favorite_queue_view: 'all',
  default_evidence_format: 'clipboard',
};

function renderRail(overrides: Partial<ComponentProps<typeof TicketWorkspaceRail>> = {}) {
  const props: ComponentProps<typeof TicketWorkspaceRail> = {
    intake: baseIntake,
    onIntakeChange: vi.fn(),
    onAnalyzeIntake: vi.fn(),
    onApplyIntakePreset: vi.fn(),
    onNoteAudienceChange: vi.fn(),
    nextActions: [],
    missingQuestions: [],
    onAcceptNextAction: vi.fn(),
    similarCases: [baseSimilarCase],
    similarCasesLoading: false,
    onRefreshSimilarCases: vi.fn(),
    onOpenSimilarCase: vi.fn(),
    onCompareSimilarCase: vi.fn(),
    onCompareLastResolution: vi.fn(),
    compareCase: null,
    onCloseCompareCase: vi.fn(),
    handoffPack: {
      summary: 'VPN issue under review',
      actions_taken: ['Reset VPN profile'],
      current_blocker: 'West region still affected',
      next_step: 'Escalate to network engineering',
      customer_safe_update: 'We are actively working the VPN issue.',
      escalation_note: 'Escalate the remaining west region failures.',
    },
    evidencePack: {
      title: 'Evidence Pack · INC-1001',
      summary: 'VPN issue under review',
      sections: [],
    },
    kbDraft: {
      title: 'VPN disconnects every morning',
      summary: 'Repeated VPN disconnects for remote users.',
      symptoms: 'Users disconnect every morning.',
      environment: 'Managed Windows laptops',
      cause: 'Likely regional gateway issue',
      resolution: 'Reset profile and escalate to network engineering.',
      warnings: [],
      prerequisites: [],
      policy_links: [],
      tags: ['incident'],
    },
    onCopyHandoffPack: vi.fn(),
    onCopyEvidencePack: vi.fn(),
    onCopyKbDraft: vi.fn(),
    resolutionKits: [baseResolutionKit],
    onSaveResolutionKit: vi.fn(),
    onApplyResolutionKit: vi.fn(),
    favorites: baseFavorites,
    onToggleFavorite: vi.fn(),
    runbookTemplates: [baseRunbookTemplate],
    guidedRunbookSession: baseRunbookSession,
    runbookNote: '',
    onRunbookNoteChange: vi.fn(),
    onStartGuidedRunbook: vi.fn(),
    onAdvanceGuidedRunbook: vi.fn(),
    onCopyRunbookProgressToNotes: vi.fn(),
    workspacePersonalization: basePersonalization,
    onPersonalizationChange: vi.fn(),
    workspaceCatalogLoading: false,
    currentResponse: 'Reset the VPN profile and verify MFA enrollment.',
    ...overrides,
  };

  return {
    props,
    ...render(<TicketWorkspaceRail {...props} />),
  };
}

function getRailRoot(container: HTMLElement) {
  const root = container.firstElementChild;
  expect(root).toBeTruthy();
  return root as HTMLElement;
}

describe('TicketWorkspaceRail', () => {
  it('exposes compare, kits, favorites, and guided runbook actions from the workspace rail', () => {
    const { props, container } = renderRail();
    const rail = getRailRoot(container);

    const similarCasesSection = within(rail).getByRole('heading', { name: 'Similar solved cases' }).closest('section');
    const resolutionKitsSection = within(rail).getByRole('heading', { name: 'Resolution kits' }).closest('section');
    const guidedRunbooksSection = within(rail).getByRole('heading', { name: 'Guided runbooks' }).closest('section');

    expect(similarCasesSection).toBeTruthy();
    expect(resolutionKitsSection).toBeTruthy();
    expect(guidedRunbooksSection).toBeTruthy();

    fireEvent.click(within(similarCasesSection as HTMLElement).getByRole('button', { name: 'Compare latest' }));
    fireEvent.click(within(resolutionKitsSection as HTMLElement).getByRole('button', { name: 'Apply kit' }));
    fireEvent.click(within(guidedRunbooksSection as HTMLElement).getByRole('button', { name: 'Copy into notes' }));

    expect(props.onCompareLastResolution).toHaveBeenCalledTimes(1);
    expect(props.onApplyResolutionKit).toHaveBeenCalledTimes(1);
    expect(props.onCopyRunbookProgressToNotes).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Favorites')).toBeTruthy();
    expect(screen.getByText('Guided runbooks')).toBeTruthy();
  });

  it('marks the active note audience as pressed and persists personalization changes through callbacks', () => {
    const { props, container } = renderRail();
    const rail = getRailRoot(container);

    const noteAudienceGroup = within(rail).getByRole('group', { name: 'Note audience' });
    const personalizationSection = within(rail).getByRole('heading', { name: 'Personalization' }).closest('div');

    expect(personalizationSection).toBeTruthy();

    const internalNote = within(noteAudienceGroup).getByRole('button', { name: 'Internal note' });
    expect(internalNote.getAttribute('aria-pressed')).toBe('true');

    fireEvent.change(
      within(personalizationSection as HTMLElement).getByRole('combobox', { name: 'Default output length' }),
      { target: { value: 'Long' } },
    );

    expect(props.onPersonalizationChange).toHaveBeenCalledWith({ preferred_output_length: 'Long' });
  });

  it('shows empty states when the catalog is unavailable and compare is not ready', () => {
    const { container } = renderRail({
      currentResponse: '',
      similarCases: [],
      resolutionKits: [],
      favorites: [],
      guidedRunbookSession: null,
      runbookTemplates: [],
    });
    const rail = getRailRoot(container);

    expect(within(rail).getByText('No similar cases yet for this ticket.')).toBeTruthy();
    expect(within(rail).getByText(/No saved kits yet/)).toBeTruthy();
    expect(within(rail).getByText(/No favorites yet/)).toBeTruthy();
    expect(within(rail).getByText(/No guided runbook active yet/)).toBeTruthy();
    const similarCasesSection = within(rail).getByRole('heading', { name: 'Similar solved cases' }).closest('section');
    expect(similarCasesSection).toBeTruthy();
    expect(
      within(similarCasesSection as HTMLElement).getByRole('button', { name: 'Compare latest' }).hasAttribute('disabled'),
    ).toBe(true);
  });
});
