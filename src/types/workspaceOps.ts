export interface ResolutionKitRecord {
  id: string;
  name: string;
  summary: string;
  category: string;
  response_template: string;
  checklist_items_json: string;
  kb_document_ids_json: string;
  runbook_scenario: string | null;
  approval_hint: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceFavoriteRecord {
  id: string;
  kind: 'runbook' | 'policy' | 'kb' | 'kit';
  label: string;
  resource_id: string;
  metadata_json: string | null;
  created_at: string;
  updated_at: string;
}

export interface RunbookSessionRecord {
  id: string;
  scenario: string;
  scope_key: string;
  status: string;
  steps_json: string;
  current_step: number;
  created_at: string;
  updated_at: string;
}

export interface RunbookTemplateRecord {
  id: string;
  name: string;
  scenario: string;
  steps_json: string;
  created_at: string;
  updated_at: string;
}

export interface RunbookStepEvidenceRecord {
  id: string;
  session_id: string;
  step_index: number;
  status: 'pending' | 'completed' | 'skipped' | 'failed';
  evidence_text: string;
  skip_reason: string | null;
  created_at: string;
}

export interface CaseOutcomeRecord {
  id: string;
  draft_id: string;
  status: string;
  outcome_summary: string;
  handoff_pack_json: string | null;
  kb_draft_json: string | null;
  evidence_pack_json: string | null;
  tags_json: string | null;
  created_at: string;
  updated_at: string;
}
