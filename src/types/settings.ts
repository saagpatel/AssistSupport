export interface InitResult {
  is_first_run: boolean;
  vector_enabled: boolean;
  vector_store_ready: boolean;
  key_storage_mode: string;
  passphrase_required: boolean;
  recovery_issue: StartupRecoveryIssue | null;
}

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

export type Theme = "light" | "dark" | "system";

export interface AuditEntry {
  timestamp: string;
  event: string | Record<string, string>;
  severity: "info" | "warning" | "error" | "critical";
  message: string;
  context?: Record<string, unknown> | null;
}

export interface JiraTransition {
  id: string;
  name: string;
  to_status: string;
}

export interface DeploymentRunRecord {
  id: string;
  target_channel: string;
  status: string;
  preflight_json: string | null;
  rollback_available: boolean;
  created_at: string;
  completed_at: string | null;
}

export interface DeploymentHealthSummary {
  total_artifacts: number;
  signed_artifacts: number;
  unsigned_artifacts: number;
  last_run: DeploymentRunRecord | null;
}

export interface IntegrationConfigRecord {
  id: string;
  integration_type: string;
  enabled: boolean;
  config_json: string | null;
  updated_at: string;
}

export interface DeploymentArtifactRecord {
  id: string;
  artifact_type: string;
  version: string;
  channel: string;
  sha256: string;
  is_signed: boolean;
  created_at: string;
}

export interface SignedArtifactVerificationResult {
  artifact: DeploymentArtifactRecord;
  is_signed: boolean;
  hash_matches: boolean;
  status: string;
}

export interface EvalRunRecord {
  id: string;
  suite_name: string;
  total_cases: number;
  passed_cases: number;
  avg_confidence: number;
  details_json: string | null;
  created_at: string;
}
