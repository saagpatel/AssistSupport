import type { RunbookStepEvidenceRecord } from "./workspaceOps";

export type DraftStatus = "draft" | "finalized" | "archived";
export type NoteAudience =
  | "internal-note"
  | "customer-safe"
  | "escalation-note";
export type IntakeUrgency = "low" | "normal" | "high" | "critical";
export type NextActionKind =
  | "answer"
  | "clarify"
  | "runbook"
  | "escalate"
  | "approval"
  | "promote_kb";

export type ResponseLength = "Short" | "Medium" | "Long";

export interface CaseIntake {
  issue?: string | null;
  environment?: string | null;
  impact?: string | null;
  urgency?: IntakeUrgency | null;
  affected_user?: string | null;
  affected_system?: string | null;
  affected_site?: string | null;
  symptoms?: string | null;
  steps_tried?: string | null;
  blockers?: string | null;
  likely_category?: string | null;
  missing_data?: string[];
  note_audience?: NoteAudience;
  user?: string | null;
  device?: string | null;
  os?: string | null;
  reproduction?: string | null;
  logs?: string | null;
  custom_fields?: Record<string, string>;
}

export interface HandoffPack {
  summary: string;
  actions_taken: string[];
  current_blocker: string;
  next_step: string;
  customer_safe_update: string;
  escalation_note: string;
}

export interface SearchExplanation {
  summary: string;
  matched_terms: string[];
  reasons: string[];
  authoritative: boolean;
}

export interface SimilarCase {
  draft_id: string;
  ticket_id: string | null;
  title: string;
  excerpt: string;
  response_excerpt: string;
  response_text: string;
  handoff_summary: string | null;
  status: DraftStatus;
  updated_at: string;
  match_score: number;
  explanation: SearchExplanation;
}

export interface MissingQuestion {
  id: string;
  question: string;
  reason: string;
  priority: "high" | "medium" | "low";
}

export interface NextActionRecommendation {
  id: string;
  kind: NextActionKind;
  label: string;
  rationale: string;
  confidence: number;
  prerequisites: string[];
}

export interface EvidencePackSection {
  label: string;
  content: string;
}

export interface EvidencePack {
  title: string;
  summary: string;
  sections: EvidencePackSection[];
}

export interface KbDraft {
  title: string;
  summary: string;
  symptoms: string;
  environment: string;
  cause: string;
  resolution: string;
  warnings: string[];
  prerequisites: string[];
  policy_links: string[];
  tags: string[];
}

export interface ResolutionKit {
  id: string;
  name: string;
  summary: string;
  category: string;
  response_template: string;
  checklist_items: string[];
  kb_document_ids: string[];
  runbook_scenario: string | null;
  approval_hint: string | null;
}

export interface WorkspaceFavorite {
  id: string;
  kind: "runbook" | "policy" | "kb" | "kit";
  label: string;
  resource_id: string;
  metadata?: Record<string, string> | null;
  created_at?: string;
  updated_at?: string;
}

export interface GuidedRunbookTemplate {
  id: string;
  name: string;
  scenario: string;
  steps: string[];
}

export interface GuidedRunbookSession {
  id: string;
  scenario: string;
  status: string;
  steps: string[];
  current_step: number;
  evidence: RunbookStepEvidenceRecord[];
}

export interface ApprovalGuidance {
  allowed: boolean;
  required_approvers: string[];
  required_evidence: string[];
  recommended_response: string;
}

export interface CollaborationDispatchPreview {
  integration_type: "jira" | "servicenow" | "slack" | "teams";
  title: string;
  destination_label: string;
  payload_preview: string;
  draft_id?: string | null;
  metadata?: Record<string, string> | null;
}

export interface SavedDraft {
  id: string;
  input_text: string;
  summary_text: string | null;
  diagnosis_json: string | null;
  response_text: string | null;
  ticket_id: string | null;
  kb_sources_json: string | null;
  created_at: string;
  updated_at: string;
  is_autosave: boolean;
  model_name?: string | null;
  case_intake_json?: string | null;
  status?: DraftStatus | null;
  handoff_summary?: string | null;
  finalized_at?: string | null;
  finalized_by?: string | null;
}

export interface TicketWorkspaceSnapshot {
  draft: SavedDraft;
  intake: CaseIntake;
  handoff_pack: HandoffPack;
  next_actions: NextActionRecommendation[];
  missing_questions: MissingQuestion[];
  evidence_pack: EvidencePack;
  similar_cases?: SimilarCase[];
  favorites?: WorkspaceFavorite[];
  kits?: ResolutionKit[];
}

export interface WorkspacePersonalization {
  preferred_note_audience: NoteAudience;
  preferred_output_length: ResponseLength;
  favorite_queue_view:
    | "all"
    | "unassigned"
    | "at_risk"
    | "in_progress"
    | "resolved";
  default_evidence_format: "clipboard" | "markdown";
}

export interface ResponseTemplate {
  id: string;
  name: string;
  category: string | null;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface TemplateContext {
  ticketId?: string;
  customerName?: string;
  agentName?: string;
}

export interface CustomVariable {
  id: string;
  name: string;
  value: string;
  created_at: string;
}

export interface SavedResponseTemplate {
  id: string;
  source_draft_id: string | null;
  source_rating: number | null;
  name: string;
  category: string | null;
  content: string;
  variables_json: string | null;
  use_count: number;
  created_at: string;
  updated_at: string;
}

export interface ResponseAlternative {
  id: string;
  draft_id: string;
  original_text: string;
  alternative_text: string;
  sources_json: string | null;
  metrics_json: string | null;
  generation_params_json: string | null;
  chosen: "original" | "alternative" | null;
  created_at: string;
}
