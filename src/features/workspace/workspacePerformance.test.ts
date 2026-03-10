import { mkdirSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import type { CaseIntake, ContextSource, SavedDraft } from '../../types';
import { buildNextActions, buildSimilarCases } from './workspaceAssistant';

function percentile(values: number[], percentileRank: number): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((percentileRank / 100) * sorted.length) - 1),
  );
  return sorted[index];
}

function createDraft(index: number): SavedDraft {
  const category = index % 2 === 0 ? 'vpn' : 'access';
  return {
    id: `draft-${index}`,
    input_text: `${category} support case ${index} for west region users with repeat authentication prompts`,
    summary_text: `${category.toUpperCase()} issue ${index}`,
    diagnosis_json: null,
    response_text: index % 3 === 0
      ? 'Reset the profile, confirm MFA enrollment, and verify the device trust state.'
      : 'Reviewed the incident and prepared the handoff pack for the next operator.',
    ticket_id: `INC-${1000 + index}`,
    kb_sources_json: index % 4 === 0 ? JSON.stringify([{ title: 'Remote Work Policy', file_path: '/mock/kb/remote-work-policy.md' }]) : null,
    created_at: '2026-03-10T10:00:00.000Z',
    updated_at: `2026-03-10T10:${String(index % 60).padStart(2, '0')}:00.000Z`,
    is_autosave: false,
    model_name: 'Local Model',
    case_intake_json: null,
    status: index % 5 === 0 ? 'draft' : 'finalized',
    handoff_summary: 'Escalated to network operations after confirming west-region scope.',
    finalized_at: index % 5 === 0 ? null : '2026-03-10T11:00:00.000Z',
    finalized_by: index % 5 === 0 ? null : 'operator',
  };
}

function writeWorkspaceLogicResults(payload: Record<string, number | string>) {
  mkdirSync('.perf-results', { recursive: true });
  writeFileSync('.perf-results/workspace-logic.json', `${JSON.stringify(payload, null, 2)}\n`);
}

describe('workspace performance targets', () => {
  it('keeps similar-case lookup and next-action generation inside roadmap budgets', () => {
    const drafts = Array.from({ length: 200 }, (_, index) => createDraft(index + 1));
    const queryText = 'vpn west region authentication prompt repeat issue';
    const intake: CaseIntake = {
      issue: 'VPN access prompts are repeating for west region users',
      environment: 'Corporate VPN on managed laptops',
      impact: 'Remote agents cannot authenticate reliably at shift start',
      urgency: 'high',
      affected_user: 'West region support agents',
      affected_system: 'VPN gateway',
      affected_site: 'West region',
      symptoms: 'Repeated MFA prompts and connection resets',
      steps_tried: 'Reset VPN profile and confirmed MFA enrollment',
      blockers: 'Issue still reproduces on managed devices',
      likely_category: 'incident',
      note_audience: 'internal-note',
      missing_data: [],
      custom_fields: {},
    };
    const sources: ContextSource[] = [
      {
        title: 'Remote Work Policy',
        file_path: '/mock/kb/remote-work-policy.md',
        snippet: 'Use approved VPN and MFA when working remotely.',
        score: 0.95,
      },
    ];

    const similarCaseLatencies: number[] = [];
    const nextActionLatencies: number[] = [];

    for (let iteration = 0; iteration < 75; iteration += 1) {
      const similarStartedAt = performance.now();
      const similarCases = buildSimilarCases({
        currentDraftId: null,
        queryText,
        drafts,
      });
      similarCaseLatencies.push(performance.now() - similarStartedAt);
      expect(similarCases.length).toBeGreaterThan(0);

      const nextActionStartedAt = performance.now();
      const nextActions = buildNextActions({
        inputText: queryText,
        responseText: '',
        intake,
        sources,
        ticket: {
          key: 'INC-9001',
          summary: 'VPN issue affecting west region agents',
          description: 'Repeated MFA prompts and reconnect loops.',
          priority: 'High',
          reporter: 'operator',
          status: 'Open',
          assignee: null,
          created: '2026-03-10T10:00:00.000Z',
          updated: '2026-03-10T10:05:00.000Z',
        },
      });
      nextActionLatencies.push(performance.now() - nextActionStartedAt);
      expect(nextActions.length).toBeGreaterThan(0);
    }

    const similarCaseP95Ms = Number(percentile(similarCaseLatencies, 95).toFixed(2));
    const nextActionP95Ms = Number(percentile(nextActionLatencies, 95).toFixed(2));

    writeWorkspaceLogicResults({
      capturedAt: new Date().toISOString(),
      similarCaseRuns: similarCaseLatencies.length,
      similarCaseP95Ms,
      similarCaseBudgetMs: 200,
      nextActionRuns: nextActionLatencies.length,
      nextActionP95Ms,
      nextActionBudgetMs: 2000,
    });

    expect(similarCaseP95Ms).toBeLessThan(200);
    expect(nextActionP95Ms).toBeLessThan(2000);
  });
});
