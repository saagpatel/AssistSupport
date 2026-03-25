import type {
  CaseIntake,
  EvidencePack,
  GuidedRunbookSession,
  GuidedRunbookTemplate,
  HandoffPack,
  KbDraft,
  MissingQuestion,
  NextActionRecommendation,
  ResolutionKit,
  SavedDraft,
  SearchExplanation,
  SimilarCase,
  WorkspaceFavorite,
} from '../../types/workspace';
import type { ContextSource } from '../../types/knowledge';
import type { JiraTicketContext } from '../../types/llm';
import type {
  RunbookSessionRecord,
  RunbookStepEvidenceRecord,
  RunbookTemplateRecord,
} from '../../types/workspaceOps';

export const DEFAULT_NOTE_AUDIENCE = 'internal-note' as const;

function normalizeText(value: string | null | undefined): string {
  return (value ?? '').trim();
}

export function compactLines(lines: Array<string | null | undefined>): string {
  return lines
    .map((line) => normalizeText(line))
    .filter(Boolean)
    .join('\n');
}

function firstNonEmpty(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const normalized = normalizeText(value);
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

function extractSection(inputText: string, labels: string[]): string | null {
  const lines = inputText.split('\n');
  const normalizedLabels = labels.map((label) => label.toLowerCase());
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    const normalizedLine = line.replace(/^[-*]\s+/, '');
    const lower = normalizedLine.toLowerCase();
    const matchingLabel = normalizedLabels.find((label) => lower.startsWith(`${label}:`));
    if (!matchingLabel) {
      continue;
    }

    const inlineValue = normalizedLine.slice(matchingLabel.length + 1).trim();
    if (inlineValue) {
      return inlineValue;
    }

    const block: string[] = [];
    for (let nextIndex = index + 1; nextIndex < lines.length; nextIndex += 1) {
      const nextLine = lines[nextIndex].trim();
      if (!nextLine) {
        if (block.length > 0) {
          break;
        }
        continue;
      }
      if (nextLine.startsWith('- ') || nextLine.startsWith('* ')) {
        block.push(nextLine.slice(2).trim());
        continue;
      }
      if (/^[A-Za-z][A-Za-z\s/()'-]+:$/.test(nextLine)) {
        break;
      }
      block.push(nextLine);
    }

    if (block.length > 0) {
      return block.join(' ');
    }
  }

  return null;
}

function inferUrgency(inputText: string, ticket?: JiraTicketContext | null): CaseIntake['urgency'] {
  const haystack = `${inputText}\n${ticket?.summary ?? ''}\n${ticket?.priority ?? ''}`.toLowerCase();
  if (/\b(sev1|p1|critical|urgent|outage|production down)\b/.test(haystack)) {
    return 'critical';
  }
  if (/\b(sev2|p2|high|major|blocked|cannot access|cannot login|can'?t log in)\b/.test(haystack)) {
    return 'high';
  }
  if (/\b(low priority|minor|when possible)\b/.test(haystack)) {
    return 'low';
  }
  return 'normal';
}

function inferCategory(inputText: string): string {
  const haystack = inputText.toLowerCase();
  if (/\b(outage|incident|sev|degraded|down)\b/.test(haystack)) {
    return 'incident';
  }
  if (/\b(access|permission|entitlement|request access)\b/.test(haystack)) {
    return 'access';
  }
  if (/\b(change|rollout|deployment|release|maintenance)\b/.test(haystack)) {
    return 'change-rollout';
  }
  if (/\b(laptop|device|computer|desktop|monitor|printer|phone|ios|android|windows|mac)\b/.test(haystack)) {
    return 'device-environment';
  }
  if (/\b(policy|allowed|approval|approve|forbidden|compliance)\b/.test(haystack)) {
    return 'policy-approval';
  }
  return 'general-support';
}

function buildMissingData(intake: CaseIntake): string[] {
  const missing: string[] = [];
  if (!normalizeText(intake.issue)) {
    missing.push('issue summary');
  }
  if (!normalizeText(intake.impact)) {
    missing.push('customer or business impact');
  }
  if (!normalizeText(intake.affected_system)) {
    missing.push('affected system');
  }
  if (!normalizeText(intake.steps_tried)) {
    missing.push('steps already tried');
  }
  if (!normalizeText(intake.blockers)) {
    missing.push('current blocker');
  }
  return missing;
}

function buildExplanation(matchedTerms: string[], reasons: string[], authoritative: boolean): SearchExplanation {
  const summary = reasons.length > 0
    ? reasons.join(' ')
    : matchedTerms.length > 0
      ? `Matched on ${matchedTerms.join(', ')}.`
      : 'Matched on overall ticket similarity.';
  return {
    summary,
    matched_terms: matchedTerms,
    reasons,
    authoritative,
  };
}

function tokenize(value: string): string[] {
  return Array.from(
    new Set(
      value
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .map((token) => token.trim())
        .filter((token) => token.length > 2),
    ),
  );
}

export function parseCaseIntake(raw: string | null | undefined): CaseIntake {
  if (!raw) {
    return {
      urgency: 'normal',
      missing_data: [],
      note_audience: DEFAULT_NOTE_AUDIENCE,
      custom_fields: {},
    };
  }

  try {
    const parsed = JSON.parse(raw) as CaseIntake;
    return {
      urgency: parsed.urgency ?? 'normal',
      missing_data: Array.isArray(parsed.missing_data) ? parsed.missing_data : [],
      note_audience: parsed.note_audience ?? DEFAULT_NOTE_AUDIENCE,
      custom_fields: parsed.custom_fields ?? {},
      ...parsed,
    };
  } catch {
    return {
      urgency: 'normal',
      missing_data: [],
      note_audience: DEFAULT_NOTE_AUDIENCE,
      custom_fields: {},
    };
  }
}

export function serializeCaseIntake(intake: CaseIntake): string | null {
  const normalized: CaseIntake = {
    ...intake,
    urgency: intake.urgency ?? 'normal',
    note_audience: intake.note_audience ?? DEFAULT_NOTE_AUDIENCE,
    missing_data: buildMissingData(intake),
    custom_fields: intake.custom_fields ?? {},
  };

  const hasMeaningfulValue = Object.entries(normalized).some(([key, value]) => {
    if (key === 'missing_data') {
      return Array.isArray(value) && value.length > 0;
    }
    if (key === 'custom_fields') {
      return value && typeof value === 'object' && Object.keys(value).length > 0;
    }
    return typeof value === 'string' ? value.trim().length > 0 : value != null;
  });

  return hasMeaningfulValue ? JSON.stringify(normalized) : null;
}

export function analyzeCaseIntake(
  inputText: string,
  ticket?: JiraTicketContext | null,
  existingIntake?: CaseIntake | null,
): CaseIntake {
  const next: CaseIntake = {
    ...parseCaseIntake(existingIntake ? JSON.stringify(existingIntake) : null),
    issue: firstNonEmpty(
      extractSection(inputText, ['issue', 'problem', 'summary']),
      ticket?.summary,
      inputText.split('\n').map((line) => line.trim()).find(Boolean) ?? null,
      existingIntake?.issue,
    ),
    environment: firstNonEmpty(
      extractSection(inputText, ['environment', 'system', 'application']),
      existingIntake?.environment,
    ),
    impact: firstNonEmpty(
      extractSection(inputText, ['impact', 'business impact', 'customer/business impact']),
      existingIntake?.impact,
    ),
    urgency: existingIntake?.urgency ?? inferUrgency(inputText, ticket),
    affected_user: firstNonEmpty(
      extractSection(inputText, ['affected user', 'requestor', 'user']),
      ticket?.reporter,
      existingIntake?.affected_user,
    ),
    affected_system: firstNonEmpty(
      extractSection(inputText, ['affected system', 'system/resource', 'service']),
      existingIntake?.affected_system,
    ),
    affected_site: firstNonEmpty(
      extractSection(inputText, ['site', 'location', 'region']),
      existingIntake?.affected_site,
    ),
    symptoms: firstNonEmpty(
      extractSection(inputText, ['symptoms', 'symptom description']),
      existingIntake?.symptoms,
      inputText.slice(0, 300),
    ),
    steps_tried: firstNonEmpty(
      extractSection(inputText, ['steps already attempted', 'actions already attempted', 'steps tried', 'actions taken']),
      existingIntake?.steps_tried,
    ),
    blockers: firstNonEmpty(
      extractSection(inputText, ['current blocker / escalation needed', 'current blocker', 'blocker / escalation needed', 'blocker']),
      existingIntake?.blockers,
    ),
    likely_category: existingIntake?.likely_category ?? inferCategory(inputText),
    note_audience: existingIntake?.note_audience ?? DEFAULT_NOTE_AUDIENCE,
    device: firstNonEmpty(
      extractSection(inputText, ['device', 'device type/model']),
      existingIntake?.device,
    ),
    os: firstNonEmpty(
      extractSection(inputText, ['os', 'operating system']),
      existingIntake?.os,
    ),
    reproduction: firstNonEmpty(
      extractSection(inputText, ['reproduction', 'steps to reproduce']),
      existingIntake?.reproduction,
    ),
    logs: firstNonEmpty(
      extractSection(inputText, ['logs', 'log snippets']),
      existingIntake?.logs,
    ),
    custom_fields: existingIntake?.custom_fields ?? {},
  };

  next.missing_data = buildMissingData(next);
  return next;
}

export function buildMissingQuestions(intake: CaseIntake): MissingQuestion[] {
  const missing = buildMissingData(intake);
  return missing.map((item, index) => ({
    id: `missing-${index + 1}`,
    question: `What is the ${item}?`,
    reason: `The workspace still needs ${item} before it can recommend a confident next step.`,
    priority: index < 2 ? 'high' : 'medium',
  }));
}

export function buildNextActions(args: {
  inputText: string;
  responseText: string;
  intake: CaseIntake;
  sources: ContextSource[];
  ticket?: JiraTicketContext | null;
}): NextActionRecommendation[] {
  const { inputText, responseText, intake, sources, ticket } = args;
  const haystack = `${inputText}\n${ticket?.summary ?? ''}\n${ticket?.description ?? ''}`.toLowerCase();
  const missingQuestions = buildMissingQuestions(intake);
  const actions: NextActionRecommendation[] = [];

  if (missingQuestions.length > 0) {
    actions.push({
      id: 'clarify',
      kind: 'clarify',
      label: 'Ask clarifying questions',
      rationale: `Critical intake fields are still missing: ${missingQuestions
        .slice(0, 3)
        .map((question) => question.question.replace(/^What is the /, '').replace(/\?$/, ''))
        .join(', ')}.`,
      confidence: 0.94,
      prerequisites: missingQuestions.slice(0, 3).map((question) => question.question),
    });
  }

  if (/\b(policy|approval|approve|allowed|forbidden|security)\b/.test(haystack)) {
    actions.push({
      id: 'approval',
      kind: 'approval',
      label: 'Check policy and approval path',
      rationale: 'This request reads like a policy or approval decision. Confirm the authoritative rule before replying.',
      confidence: 0.9,
      prerequisites: ['Run approval search', 'Confirm required approver and evidence'],
    });
  }

  if (/\b(outage|incident|sev|critical|degraded|down)\b/.test(haystack)) {
    actions.push({
      id: 'runbook',
      kind: 'runbook',
      label: 'Start a guided incident runbook',
      rationale: 'The ticket has incident-like language and should move through a repeatable containment path.',
      confidence: 0.87,
      prerequisites: ['Capture scope and impact', 'Record actions already attempted'],
    });
    actions.push({
      id: 'escalate',
      kind: 'escalate',
      label: 'Prepare an escalation note',
      rationale: 'High-severity incidents benefit from an explicit escalation pack and owner handoff.',
      confidence: 0.82,
      prerequisites: ['Draft a current blocker summary', 'Attach evidence pack'],
    });
  }

  if (!responseText.trim() && missingQuestions.length === 0) {
    actions.push({
      id: 'answer',
      kind: 'answer',
      label: 'Generate a grounded response',
      rationale: 'The intake is sufficiently complete to draft a response now.',
      confidence: sources.length > 0 ? 0.88 : 0.72,
      prerequisites: sources.length > 0 ? [] : ['Gather or confirm KB sources first'],
    });
  }

  if (responseText.trim() && sources.length === 0) {
    actions.push({
      id: 'promote-kb',
      kind: 'promote_kb',
      label: 'Capture knowledge gap',
      rationale: 'You have a draft response but no KB grounding. This likely needs either better sources or a new KB article.',
      confidence: 0.76,
      prerequisites: ['Confirm final resolution path', 'Decide whether this should become a KB draft'],
    });
  }

  return actions.slice(0, 5);
}

export function buildHandoffPack(args: {
  inputText: string;
  responseText: string;
  intake: CaseIntake;
  sources: ContextSource[];
  ticket?: JiraTicketContext | null;
  diagnosticNotes?: string | null;
}): HandoffPack {
  const { inputText, responseText, intake, sources, ticket, diagnosticNotes } = args;
  const summary = compactLines([
    ticket?.summary,
    intake.issue,
    intake.impact ? `Impact: ${intake.impact}` : null,
    intake.affected_system ? `System: ${intake.affected_system}` : null,
  ]) || normalizeText(inputText).slice(0, 280);

  const actionsTaken = [
    normalizeText(intake.steps_tried),
    normalizeText(diagnosticNotes),
    responseText.trim() ? 'Draft response prepared in workspace.' : '',
  ].filter(Boolean);

  const customerSafeUpdate = responseText.trim()
    ? responseText.trim()
    : `We're reviewing the issue${intake.affected_system ? ` affecting ${intake.affected_system}` : ''} and confirming the next safe action.`;

  const currentBlocker = firstNonEmpty(
    intake.blockers,
    buildMissingData(intake).length > 0
      ? `Missing intake details: ${buildMissingData(intake).join(', ')}.`
      : null,
    sources.length === 0 ? 'No grounded KB sources attached yet.' : null,
    'Waiting for next operator action.',
  ) ?? 'Waiting for next operator action.';

  const nextStep = firstNonEmpty(
    buildMissingData(intake).length > 0 ? `Collect ${buildMissingData(intake).slice(0, 2).join(' and ')}.` : null,
    sources.length === 0 ? 'Attach authoritative KB or policy sources.' : null,
    responseText.trim() ? 'Review, send, or escalate the prepared response.' : null,
    'Continue triage in the shared workspace.',
  ) ?? 'Continue triage in the shared workspace.';

  return {
    summary,
    actions_taken: actionsTaken.length > 0 ? actionsTaken : ['Initial ticket intake captured.'],
    current_blocker: currentBlocker,
    next_step: nextStep,
    customer_safe_update: customerSafeUpdate,
    escalation_note: compactLines([
      summary,
      `Current blocker: ${currentBlocker}`,
      `Next step: ${nextStep}`,
      sources.length > 0 ? `Attached sources: ${sources.map((source) => source.title ?? source.file_path).slice(0, 3).join(', ')}` : null,
    ]),
  };
}

export function buildSimilarCases(args: {
  currentDraftId?: string | null;
  queryText: string;
  drafts: SavedDraft[];
}): SimilarCase[] {
  const queryTokens = tokenize(args.queryText);
  if (queryTokens.length === 0) {
    return [];
  }

  return args.drafts
    .filter((draft) => {
      if (draft.is_autosave || draft.id === args.currentDraftId) {
        return false;
      }

      return draft.status === 'finalized' || Boolean(draft.handoff_summary) || Boolean(draft.finalized_at);
    })
    .map<SimilarCase | null>((draft) => {
      const searchable = compactLines([
        draft.ticket_id,
        draft.summary_text,
        draft.input_text,
        draft.response_text,
        draft.handoff_summary,
      ]);
      const draftTokens = tokenize(searchable);
      const matchedTerms = queryTokens.filter((token) => draftTokens.includes(token));
      if (matchedTerms.length === 0) {
        return null;
      }

      const scoreBase = matchedTerms.length / Math.max(queryTokens.length, 1);
      const statusBoost = draft.status === 'finalized' ? 0.25 : 0;
      const handoffBoost = draft.handoff_summary ? 0.1 : 0;
      const responseBoost = draft.response_text ? 0.1 : 0;
      const matchScore = Number(Math.min(1, scoreBase + statusBoost + handoffBoost + responseBoost).toFixed(3));

      const reasons = [
        matchedTerms.length > 0 ? `Matched on ${matchedTerms.join(', ')}.` : null,
        draft.status === 'finalized' ? 'Previous case was finalized.' : null,
        draft.handoff_summary ? 'Previous case includes handoff context.' : null,
      ].filter((reason): reason is string => Boolean(reason));

      return {
        draft_id: draft.id,
        ticket_id: draft.ticket_id ?? null,
        title: draft.ticket_id ?? draft.summary_text ?? `Draft ${draft.id.slice(0, 8)}`,
        excerpt: normalizeText(draft.input_text).slice(0, 180),
        response_excerpt: normalizeText(draft.response_text).slice(0, 180),
        response_text: normalizeText(draft.response_text),
        handoff_summary: draft.handoff_summary ?? null,
        status: draft.status ?? 'draft',
        updated_at: draft.updated_at,
        match_score: matchScore,
        explanation: buildExplanation(matchedTerms, reasons, Boolean(draft.kb_sources_json)),
      };
    })
    .filter((item): item is SimilarCase => Boolean(item))
    .sort((left, right) => right.match_score - left.match_score || right.updated_at.localeCompare(left.updated_at))
    .slice(0, 5);
}

export function buildKbDraft(args: {
  draft: SavedDraft;
  intake: CaseIntake;
  handoffPack: HandoffPack;
  sources: ContextSource[];
}): KbDraft {
  const { draft, intake, handoffPack, sources } = args;
  return {
    title: firstNonEmpty(intake.issue, draft.summary_text, draft.ticket_id, 'Support resolution draft') ?? 'Support resolution draft',
    summary: handoffPack.summary,
    symptoms: firstNonEmpty(intake.symptoms, draft.input_text, 'Capture the user-visible symptoms here.') ?? '',
    environment: firstNonEmpty(intake.environment, intake.affected_system, intake.device, 'Capture environment and system scope here.') ?? '',
    cause: firstNonEmpty(intake.blockers, 'Capture confirmed root cause or current hypothesis here.') ?? '',
    resolution: firstNonEmpty(draft.response_text, handoffPack.customer_safe_update, 'Capture the operator resolution here.') ?? '',
    warnings: sources.length === 0 ? ['No authoritative KB sources were attached to this resolution.'] : [],
    prerequisites: buildMissingData(intake),
    policy_links: sources
      .filter((source) => /policy/i.test(source.title ?? '') || /policy/i.test(source.file_path))
      .map((source) => source.title ?? source.file_path)
      .slice(0, 3),
    tags: [intake.likely_category, intake.urgency, draft.ticket_id ? 'ticket-linked' : null]
      .filter((tag): tag is string => Boolean(tag)),
  };
}

export function buildEvidencePack(args: {
  draft: SavedDraft;
  intake: CaseIntake;
  handoffPack: HandoffPack;
  nextActions: NextActionRecommendation[];
  sources: ContextSource[];
}): EvidencePack {
  const { draft, intake, handoffPack, nextActions, sources } = args;
  return {
    title: draft.ticket_id ? `Evidence Pack · ${draft.ticket_id}` : `Evidence Pack · ${draft.id.slice(0, 8)}`,
    summary: handoffPack.summary,
    sections: [
      {
        label: 'Case Intake',
        content: compactLines([
          intake.issue ? `Issue: ${intake.issue}` : null,
          intake.impact ? `Impact: ${intake.impact}` : null,
          intake.affected_system ? `System: ${intake.affected_system}` : null,
          intake.affected_user ? `User: ${intake.affected_user}` : null,
          intake.steps_tried ? `Steps tried: ${intake.steps_tried}` : null,
          intake.blockers ? `Blocker: ${intake.blockers}` : null,
        ]),
      },
      {
        label: 'Recommended Next Actions',
        content: nextActions.map((action) => `- ${action.label}: ${action.rationale}`).join('\n'),
      },
      {
        label: 'Current Handoff Pack',
        content: compactLines([
          `Summary: ${handoffPack.summary}`,
          `Current blocker: ${handoffPack.current_blocker}`,
          `Next step: ${handoffPack.next_step}`,
          `Customer-safe update: ${handoffPack.customer_safe_update}`,
        ]),
      },
      {
        label: 'Attached Sources',
        content: sources.length > 0
          ? sources.map((source) => `- ${source.title ?? source.file_path}`).join('\n')
          : 'No authoritative sources attached.',
      },
    ],
  };
}

export function formatHandoffPackForClipboard(pack: HandoffPack): string {
  return compactLines([
    `Summary: ${pack.summary}`,
    '',
    'Actions taken:',
    ...pack.actions_taken.map((action) => `- ${action}`),
    '',
    `Current blocker: ${pack.current_blocker}`,
    `Next step: ${pack.next_step}`,
    '',
    'Customer-safe update:',
    pack.customer_safe_update,
    '',
    'Escalation note:',
    pack.escalation_note,
  ]);
}

export function formatEvidencePackForClipboard(pack: EvidencePack): string {
  return compactLines([
    pack.title,
    '',
    pack.summary,
    '',
    ...pack.sections.flatMap((section) => [section.label, section.content, '']),
  ]);
}

export function formatKbDraftForClipboard(kbDraft: KbDraft): string {
  return compactLines([
    `# ${kbDraft.title}`,
    '',
    `Summary: ${kbDraft.summary}`,
    '',
    '## Symptoms',
    kbDraft.symptoms,
    '',
    '## Environment',
    kbDraft.environment,
    '',
    '## Cause',
    kbDraft.cause,
    '',
    '## Resolution',
    kbDraft.resolution,
    '',
    '## Warnings',
    kbDraft.warnings.length > 0 ? kbDraft.warnings.map((warning) => `- ${warning}`).join('\n') : 'None recorded.',
    '',
    '## Prerequisites',
    kbDraft.prerequisites.length > 0 ? kbDraft.prerequisites.map((item) => `- ${item}`).join('\n') : 'None recorded.',
    '',
    '## Policy Links',
    kbDraft.policy_links.length > 0 ? kbDraft.policy_links.map((item) => `- ${item}`).join('\n') : 'None recorded.',
    '',
    '## Tags',
    kbDraft.tags.join(', '),
  ]);
}

export function parseStringArrayJson(raw: string | null | undefined): string[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

export function toResolutionKit(record: {
  id: string;
  name: string;
  summary: string;
  category: string;
  response_template: string;
  checklist_items_json: string;
  kb_document_ids_json: string;
  runbook_scenario: string | null;
  approval_hint: string | null;
}): ResolutionKit {
  return {
    id: record.id,
    name: record.name,
    summary: record.summary,
    category: record.category,
    response_template: record.response_template,
    checklist_items: parseStringArrayJson(record.checklist_items_json),
    kb_document_ids: parseStringArrayJson(record.kb_document_ids_json),
    runbook_scenario: record.runbook_scenario,
    approval_hint: record.approval_hint,
  };
}

export function buildResolutionKitFromWorkspace(args: {
  intake: CaseIntake;
  kbDraft: KbDraft;
  responseText: string;
  sources: ContextSource[];
}): Omit<ResolutionKit, 'id'> {
  const { intake, kbDraft, responseText, sources } = args;
  return {
    name: firstNonEmpty(intake.issue, kbDraft.title, 'Workspace resolution kit') ?? 'Workspace resolution kit',
    summary: kbDraft.summary,
    category: intake.likely_category ?? 'general-support',
    response_template: normalizeText(responseText) || kbDraft.resolution,
    checklist_items: [
      intake.steps_tried ? `Confirm prior actions: ${intake.steps_tried}` : null,
      intake.blockers ? `Clear current blocker: ${intake.blockers}` : null,
      sources.length === 0 ? 'Attach or confirm authoritative KB sources' : 'Verify linked KB and policy sources',
    ].filter((item): item is string => Boolean(item)),
    kb_document_ids: sources.map((source) => source.document_id).filter(Boolean).slice(0, 5),
    runbook_scenario: intake.likely_category === 'incident' ? 'incident-response' : null,
    approval_hint: intake.likely_category === 'policy-approval' ? 'Route to policy owner or manager approval before closing.' : null,
  };
}

export function applyResolutionKit(args: {
  currentInput: string;
  currentResponse: string;
  currentIntake: CaseIntake;
  kit: ResolutionKit;
}): {
  inputText: string;
  responseText: string;
  intake: CaseIntake;
  checklistText: string;
} {
  const { currentInput, currentResponse, currentIntake, kit } = args;
  return {
    inputText: currentInput,
    responseText: normalizeText(currentResponse) || kit.response_template,
    intake: {
      ...currentIntake,
      likely_category: currentIntake.likely_category ?? kit.category,
    },
    checklistText: compactLines([
      'Resolution kit checklist:',
      ...kit.checklist_items.map((item) => `- ${item}`),
      kit.approval_hint ? `- Approval guidance: ${kit.approval_hint}` : null,
    ]),
  };
}

export function toGuidedRunbookTemplate(record: RunbookTemplateRecord): GuidedRunbookTemplate {
  return {
    id: record.id,
    name: record.name,
    scenario: record.scenario,
    steps: parseStringArrayJson(record.steps_json),
  };
}

export function toGuidedRunbookSession(
  record: RunbookSessionRecord,
  evidence: RunbookStepEvidenceRecord[],
): GuidedRunbookSession {
  return {
    id: record.id,
    scenario: record.scenario,
    status: record.status,
    steps: parseStringArrayJson(record.steps_json),
    current_step: record.current_step,
    evidence,
  };
}

export function toWorkspaceFavorite(record: {
  id: string;
  kind: 'runbook' | 'policy' | 'kb' | 'kit' | string;
  label: string;
  resource_id: string;
  metadata_json?: string | null;
  created_at?: string;
  updated_at?: string;
}): WorkspaceFavorite {
  let metadata: Record<string, string> | null = null;
  if (record.metadata_json) {
    try {
      const parsed = JSON.parse(record.metadata_json) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        metadata = Object.fromEntries(
          Object.entries(parsed).filter(([, value]) => typeof value === 'string'),
        );
      }
    } catch {
      metadata = null;
    }
  }

  return {
    id: record.id,
    kind: ['runbook', 'policy', 'kb', 'kit'].includes(record.kind) ? (record.kind as WorkspaceFavorite['kind']) : 'kit',
    label: record.label,
    resource_id: record.resource_id,
    metadata,
    created_at: record.created_at,
    updated_at: record.updated_at,
  };
}
