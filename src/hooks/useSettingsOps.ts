import { useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type {
  DeploymentArtifactRecord,
  DeploymentHealthSummary,
  EvalRunRecord,
  IntegrationConfigRecord,
  SignedArtifactVerificationResult,
} from '../types/settings';

export interface DeploymentPreflightResult {
  ok: boolean;
  checks: string[];
}

export interface EvalHarnessCase {
  query: string;
  expected_mode?: string;
  min_confidence?: number;
}

export interface EvalHarnessResult {
  run_id: string;
  total_cases: number;
  passed_cases: number;
  avg_confidence: number;
}

export interface SettingsOpsClient {
  getDeploymentHealthSummary: () => Promise<DeploymentHealthSummary>;
  listDeploymentArtifacts: (limit?: number) => Promise<DeploymentArtifactRecord[]>;
  runDeploymentPreflight: (targetChannel: string) => Promise<DeploymentPreflightResult>;
  recordDeploymentArtifact: (
    artifactType: string,
    version: string,
    channel: string,
    sha256: string,
    isSigned: boolean,
  ) => Promise<string>;
  verifySignedArtifact: (
    artifactId: string,
    expectedSha256?: string,
  ) => Promise<SignedArtifactVerificationResult>;
  rollbackDeploymentRun: (runId: string, reason?: string) => Promise<void>;
  runEvalHarness: (suiteName: string, cases: EvalHarnessCase[]) => Promise<EvalHarnessResult>;
  listEvalRuns: (limit?: number) => Promise<EvalRunRecord[]>;
  listIntegrations: () => Promise<IntegrationConfigRecord[]>;
  configureIntegration: (integrationType: string, enabled: boolean, configJson?: string) => Promise<void>;
}

export function useSettingsOps(): SettingsOpsClient {
  const getDeploymentHealthSummary = useCallback(async (): Promise<DeploymentHealthSummary> => {
    return invoke<DeploymentHealthSummary>('get_deployment_health_summary');
  }, []);

  const listDeploymentArtifacts = useCallback(async (limit = 50): Promise<DeploymentArtifactRecord[]> => {
    return invoke<DeploymentArtifactRecord[]>('list_deployment_artifacts', { limit });
  }, []);

  const runDeploymentPreflight = useCallback(async (targetChannel: string): Promise<DeploymentPreflightResult> => {
    return invoke<DeploymentPreflightResult>('run_deployment_preflight', { targetChannel });
  }, []);

  const recordDeploymentArtifact = useCallback(async (
    artifactType: string,
    version: string,
    channel: string,
    sha256: string,
    isSigned: boolean,
  ): Promise<string> => {
    return invoke<string>('record_deployment_artifact', {
      artifactType,
      version,
      channel,
      sha256,
      isSigned,
    });
  }, []);

  const verifySignedArtifact = useCallback(async (
    artifactId: string,
    expectedSha256?: string,
  ): Promise<SignedArtifactVerificationResult> => {
    return invoke<SignedArtifactVerificationResult>('verify_signed_artifact', {
      artifactId,
      expectedSha256: expectedSha256 ?? null,
    });
  }, []);

  const rollbackDeploymentRun = useCallback(async (runId: string, reason?: string): Promise<void> => {
    await invoke('rollback_deployment_run', {
      runId,
      reason: reason ?? null,
    });
  }, []);

  const runEvalHarness = useCallback(async (
    suiteName: string,
    cases: EvalHarnessCase[],
  ): Promise<EvalHarnessResult> => {
    return invoke<EvalHarnessResult>('run_eval_harness', { suiteName, cases });
  }, []);

  const listEvalRuns = useCallback(async (limit = 50): Promise<EvalRunRecord[]> => {
    return invoke<EvalRunRecord[]>('list_eval_runs', { limit });
  }, []);

  const listIntegrations = useCallback(async (): Promise<IntegrationConfigRecord[]> => {
    return invoke<IntegrationConfigRecord[]>('list_integrations');
  }, []);

  const configureIntegration = useCallback(async (
    integrationType: string,
    enabled: boolean,
    configJson?: string,
  ): Promise<void> => {
    await invoke('configure_integration', {
      integrationType,
      enabled,
      configJson: configJson ?? null,
    });
  }, []);

  return {
    getDeploymentHealthSummary,
    listDeploymentArtifacts,
    runDeploymentPreflight,
    recordDeploymentArtifact,
    verifySignedArtifact,
    rollbackDeploymentRun,
    runEvalHarness,
    listEvalRuns,
    listIntegrations,
    configureIntegration,
  };
}
