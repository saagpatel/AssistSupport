export interface StartupRecoveryConflict {
  name: string;
  old_path: string;
  new_path: string;
  reason: string;
}

export interface StartupRecoveryIssue {
  code: string;
  summary: string;
  details: string | null;
  can_repair: boolean;
  can_restore_backup: boolean;
  requires_manual_resolution: boolean;
  migration_conflicts: StartupRecoveryConflict[];
}

export interface InitResult {
  is_first_run: boolean;
  vector_enabled: boolean;
  vector_store_ready: boolean;
  key_storage_mode: string;
  passphrase_required: boolean;
  recovery_issue: StartupRecoveryIssue | null;
}

export interface ImportSummary {
  drafts_imported: number;
  templates_imported: number;
  variables_imported: number;
  trees_imported: number;
}

export interface ModelStateResult {
  llm_model_id: string | null;
  llm_model_path: string | null;
  llm_loaded: boolean;
  embeddings_model_path: string | null;
  embeddings_loaded: boolean;
}

export interface StartupMetricsResult {
  total_ms: number;
  init_app_ms: number;
  models_cached: boolean;
}

export interface VectorConsent {
  enabled: boolean;
  consented_at: string | null;
  encryption_supported: boolean | null;
}

export interface MemoryKernelIntegrationPin {
  memorykernel_repo: string;
  release_tag: string;
  commit_sha: string;
  expected_service_contract_version: string;
  expected_api_contract_version: string;
  expected_integration_baseline: string;
  default_base_url: string;
  default_timeout_ms: number;
}

export interface MemoryKernelPreflightStatus {
  enabled: boolean;
  ready: boolean;
  enrichment_enabled: boolean;
  status: string;
  message: string;
  base_url: string;
  service_contract_version: string | null;
  api_contract_version: string | null;
  expected_service_contract_version: string;
  expected_api_contract_version: string;
  integration_baseline: string;
  release_tag: string;
  commit_sha: string;
}

export interface MemoryKernelEnrichmentResult {
  applied: boolean;
  status: string;
  message: string;
  fallback_reason: string | null;
  machine_error_code: string | null;
  context_package_id: string | null;
  enrichment_text: string | null;
  preflight: MemoryKernelPreflightStatus;
}

export type HealthStatus = "healthy" | "warning" | "error" | "unavailable";

export interface ComponentHealth {
  name: string;
  status: HealthStatus;
  message: string;
  details: string | null;
  can_repair: boolean;
}

export interface SystemHealth {
  database: ComponentHealth;
  vector_store: ComponentHealth;
  llm_engine: ComponentHealth;
  embedding_model: ComponentHealth;
  file_system: ComponentHealth;
  overall_status: HealthStatus;
  checked_at: string;
}

export interface RepairResult {
  component: string;
  success: boolean;
  action_taken: string;
  message: string | null;
}

export interface FailureMode {
  id: string;
  problem: string;
  symptoms: string[];
  resolution_steps: string[];
  auto_repair_available: boolean;
}

export interface QuickHealthResult {
  healthy: boolean;
  checks_passed: number;
  checks_total: number;
  issues: string[];
}

export type Tab =
  | "draft"
  | "followups"
  | "knowledge"
  | "analytics"
  | "ops"
  | "settings";

export type Theme = "light" | "dark" | "system";

export type ToastType = "success" | "error" | "info" | "warning";

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}
