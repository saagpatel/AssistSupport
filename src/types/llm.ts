import type { ContextSource, SearchResult } from "./knowledge";
import type { ResponseLength } from "./workspace";

export interface ModelInfo {
  id: string;
  name: string;
  path?: string;
  size?: string;
  description?: string;
  size_bytes?: number;
  n_params?: number | null;
  n_ctx?: number;
  n_ctx_train?: number;
  n_embd?: number;
  n_vocab?: number;
  n_gpu_layers?: number;
  verification_status?: string | null;
}

export interface GgufFileInfo {
  file_name: string;
  file_size: number;
  is_valid: boolean;
  integrity_status?: string;
}

export interface GenerationParams {
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  repeat_penalty?: number;
  stop_sequences?: string[];
  context_window?: number;
}

export interface GenerationResult {
  text: string;
  tokens_generated: number;
  duration_ms: number;
}

export interface StreamToken {
  token: string;
  done: boolean;
}

export interface TreeDecisions {
  tree_name: string;
  path_summary: string;
}

export interface JiraTicketContext {
  key: string;
  summary: string;
  description: string | null;
  status: string;
  priority: string | null;
  assignee: string | null;
  reporter: string;
  created: string;
  updated: string;
  issue_type: string;
}

export interface GenerateWithContextParams {
  user_input: string;
  kb_query?: string;
  kb_limit?: number;
  ocr_text?: string;
  diagnostic_notes?: string;
  tree_decisions?: TreeDecisions;
  jira_ticket?: JiraTicketContext;
  response_length?: ResponseLength;
  gen_params?: GenerationParams;
}

export interface GenerationMetrics {
  tokens_per_second: number;
  sources_used: number;
  word_count: number;
  length_target_met: boolean;
  context_utilization: number;
}

export type ConfidenceMode = "answer" | "clarify" | "abstain";

export interface ConfidenceAssessment {
  mode: ConfidenceMode;
  score: number;
  rationale: string;
}

export interface GroundedClaim {
  claim: string;
  source_indexes: number[];
  support_level: string;
}

export interface GenerateWithContextResult {
  text: string;
  tokens_generated: number;
  duration_ms: number;
  source_chunk_ids: string[];
  sources: ContextSource[];
  metrics: GenerationMetrics;
  prompt_template_version: string;
  confidence: ConfidenceAssessment;
  grounding: GroundedClaim[];
}

export type FirstResponseTone = "slack" | "jira";

export interface FirstResponseParams {
  user_input: string;
  tone: FirstResponseTone;
  ocr_text?: string;
  jira_ticket?: JiraTicketContext;
}

export interface FirstResponseResult {
  text: string;
  tokens_generated: number;
  duration_ms: number;
}

export interface ChecklistItem {
  id: string;
  text: string;
  category?: string | null;
  priority?: string | null;
  details?: string | null;
}

export interface ChecklistState {
  items: ChecklistItem[];
  completed_ids: string[];
}

export interface ChecklistGenerateParams {
  user_input: string;
  ocr_text?: string;
  diagnostic_notes?: string;
  tree_decisions?: TreeDecisions;
  jira_ticket?: JiraTicketContext;
}

export interface ChecklistUpdateParams extends ChecklistGenerateParams {
  checklist: ChecklistState;
}

export interface ChecklistResult {
  items: ChecklistItem[];
}

export interface ModelSource {
  name: string;
  repo: string;
  filename: string;
  size_bytes: number | null;
  sha256: string | null;
}

export interface DownloadProgress {
  model_id: string;
  percent: number;
  downloaded_bytes: number;
  total_bytes: number;
  speed_bps: number;
}

export interface EmbeddingModelInfo {
  path: string;
  name: string;
  embedding_dim: number;
  size_bytes: number;
}

export interface OcrResult {
  text: string;
  confidence: number;
}

export interface DecisionTree {
  id: string;
  name: string;
  category: string | null;
  tree_json: string;
  source: "builtin" | "custom";
  created_at: string;
  updated_at: string;
}

export interface TreeStructure {
  root_node_id: string;
  nodes: Record<string, TreeNode>;
}

export interface TreeNode {
  id: string;
  type: "question" | "action" | "terminal";
  title: string;
  content: string | null;
  options?: TreeOption[];
}

export interface TreeOption {
  label: string;
  next_node_id: string | null;
}

export interface DiagnosticSession {
  id: string;
  draft_id: string | null;
  checklist_json: string | null;
  findings_json: string | null;
  decision_tree_id: string | null;
  tree_path_json: string | null;
  escalation_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface TreePath {
  tree_id: string;
  visited_nodes: string[];
  current_node_id: string;
}

export interface TestModelResult {
  success: boolean;
  output: string;
  duration_ms: number;
  tokens_per_sec: number;
}

export type { ContextSource, SearchResult };
