import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";
import {
  getResponseQualityThresholds,
  type ResponseQualityThresholds,
} from "../../features/analytics/qualityThresholds";
import type { ModelInfo } from "../../types/llm";
import type {
  AuditEntry,
  DeploymentHealthSummary,
  IntegrationConfigRecord,
  MemoryKernelPreflightStatus,
} from "../../types/settings";

interface UseSettingsInitOptions {
  getLoadedModel: () => Promise<string | null>;
  getModelInfo: () => Promise<ModelInfo | null>;
  listModels: () => Promise<string[]>;
  getKbFolder: () => Promise<string | null>;
  getIndexStats: () => Promise<{
    total_chunks: number;
    total_files: number;
  } | null>;
  getVectorConsent: () => Promise<{ enabled: boolean } | null>;
  getContextWindow: () => Promise<number | null>;
  checkJiraConfig: () => Promise<boolean>;
  isEmbeddingDownloaded: () => Promise<boolean>;
  getDeploymentHealthSummary: () => Promise<DeploymentHealthSummary | null>;
  listIntegrations: () => Promise<IntegrationConfigRecord[]>;
  checkEmbeddingStatus: () => Promise<unknown>;
  refreshSearchApiEmbeddingStatus: () => Promise<unknown>;
  onShowError: (message: string) => void;
}

interface SettingsInitState {
  loadedModel: string | null;
  setLoadedModel: React.Dispatch<React.SetStateAction<string | null>>;
  loadedModelInfo: ModelInfo | null;
  setLoadedModelInfo: React.Dispatch<React.SetStateAction<ModelInfo | null>>;
  downloadedModels: string[];
  setDownloadedModels: React.Dispatch<React.SetStateAction<string[]>>;
  kbFolder: string | null;
  setKbFolder: React.Dispatch<React.SetStateAction<string | null>>;
  indexStats: { total_chunks: number; total_files: number } | null;
  setIndexStats: React.Dispatch<
    React.SetStateAction<{
      total_chunks: number;
      total_files: number;
    } | null>
  >;
  vectorEnabled: boolean;
  setVectorEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  jiraConfigured: boolean;
  setJiraConfigured: React.Dispatch<React.SetStateAction<boolean>>;
  contextWindowSize: number | null;
  setContextWindowSize: React.Dispatch<React.SetStateAction<number | null>>;
  embeddingDownloaded: boolean;
  setEmbeddingDownloaded: React.Dispatch<React.SetStateAction<boolean>>;
  allowUnverifiedLocalModels: boolean;
  setAllowUnverifiedLocalModels: React.Dispatch<React.SetStateAction<boolean>>;
  deploymentHealth: DeploymentHealthSummary | null;
  setDeploymentHealth: React.Dispatch<
    React.SetStateAction<DeploymentHealthSummary | null>
  >;
  integrations: IntegrationConfigRecord[];
  setIntegrations: React.Dispatch<
    React.SetStateAction<IntegrationConfigRecord[]>
  >;
  qualityThresholds: ResponseQualityThresholds;
  setQualityThresholds: React.Dispatch<
    React.SetStateAction<ResponseQualityThresholds>
  >;
  memoryKernelPreflight: MemoryKernelPreflightStatus | null;
  memoryKernelLoading: boolean;
  auditEntries: AuditEntry[];
  setAuditEntries: React.Dispatch<React.SetStateAction<AuditEntry[]>>;
  auditLoading: boolean;
  auditPage: number;
  setAuditPage: React.Dispatch<React.SetStateAction<number>>;
  loadInitialState: () => Promise<void>;
  loadAuditEntries: () => Promise<void>;
  refreshMemoryKernelStatus: () => Promise<void>;
}

export function useSettingsInit(
  options: UseSettingsInitOptions,
): SettingsInitState {
  const {
    getLoadedModel,
    getModelInfo,
    listModels,
    getKbFolder,
    getIndexStats,
    getVectorConsent,
    getContextWindow,
    checkJiraConfig,
    isEmbeddingDownloaded,
    getDeploymentHealthSummary,
    listIntegrations,
    checkEmbeddingStatus,
    refreshSearchApiEmbeddingStatus,
    onShowError,
  } = options;

  const [loadedModel, setLoadedModel] = useState<string | null>(null);
  const [loadedModelInfo, setLoadedModelInfo] = useState<ModelInfo | null>(
    null,
  );
  const [downloadedModels, setDownloadedModels] = useState<string[]>([]);
  const [kbFolder, setKbFolder] = useState<string | null>(null);
  const [indexStats, setIndexStats] = useState<{
    total_chunks: number;
    total_files: number;
  } | null>(null);
  const [vectorEnabled, setVectorEnabled] = useState(false);
  const [jiraConfigured, setJiraConfigured] = useState(false);
  const [contextWindowSize, setContextWindowSize] = useState<number | null>(
    null,
  );
  const [embeddingDownloaded, setEmbeddingDownloaded] = useState(false);
  const [allowUnverifiedLocalModels, setAllowUnverifiedLocalModels] =
    useState(false);
  const [deploymentHealth, setDeploymentHealth] =
    useState<DeploymentHealthSummary | null>(null);
  const [integrations, setIntegrations] = useState<IntegrationConfigRecord[]>(
    [],
  );
  const [qualityThresholds, setQualityThresholds] =
    useState<ResponseQualityThresholds>(() => getResponseQualityThresholds());
  const [memoryKernelPreflight, setMemoryKernelPreflight] =
    useState<MemoryKernelPreflightStatus | null>(null);
  const [memoryKernelLoading, setMemoryKernelLoading] = useState(false);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditPage, setAuditPage] = useState(1);

  const loadAuditEntries = useCallback(async () => {
    setAuditLoading(true);
    try {
      const entries = await invoke<AuditEntry[]>("get_audit_entries", {
        limit: 200,
      });
      setAuditEntries(entries ?? []);
      setAuditPage(1);
    } catch (err) {
      onShowError(`Failed to load audit logs: ${err}`);
    } finally {
      setAuditLoading(false);
    }
  }, [onShowError]);

  const refreshMemoryKernelStatus = useCallback(async () => {
    setMemoryKernelLoading(true);
    try {
      const status = await invoke<MemoryKernelPreflightStatus>(
        "get_memory_kernel_preflight_status",
      );
      setMemoryKernelPreflight(status);
    } catch {
      setMemoryKernelPreflight(null);
    } finally {
      setMemoryKernelLoading(false);
    }
  }, []);

  const loadInitialState = useCallback(async () => {
    try {
      const [
        loaded,
        modelInfo,
        downloaded,
        folder,
        stats,
        consent,
        jiraConfigResult,
        ctxWindow,
        embDownloaded,
        allowUnverifiedModels,
        deployHealth,
        integrationsList,
      ] = await Promise.all([
        getLoadedModel(),
        getModelInfo().catch(() => null),
        listModels(),
        getKbFolder(),
        getIndexStats().catch(() => null),
        getVectorConsent().catch(() => null),
        checkJiraConfig().catch(() => false),
        getContextWindow().catch(() => null),
        isEmbeddingDownloaded().catch(() => false),
        invoke<boolean>("get_allow_unverified_local_models").catch(() => false),
        getDeploymentHealthSummary().catch(() => null),
        listIntegrations().catch(() => []),
      ]);
      setLoadedModel(loaded);
      setLoadedModelInfo(modelInfo);
      setDownloadedModels(downloaded);
      setKbFolder(folder);
      setIndexStats(stats);
      if (consent) {
        setVectorEnabled(consent.enabled);
      }
      setJiraConfigured(jiraConfigResult);
      setContextWindowSize(ctxWindow);
      setEmbeddingDownloaded(embDownloaded);
      setAllowUnverifiedLocalModels(allowUnverifiedModels);
      setDeploymentHealth(deployHealth);
      setIntegrations(integrationsList ?? []);
      setQualityThresholds(getResponseQualityThresholds());

      await Promise.all([
        checkEmbeddingStatus(),
        refreshSearchApiEmbeddingStatus(),
      ]);
    } catch (err) {
      console.error("Failed to load settings state:", err);
    }
  }, [
    getLoadedModel,
    getModelInfo,
    listModels,
    getKbFolder,
    getIndexStats,
    getVectorConsent,
    checkJiraConfig,
    getContextWindow,
    isEmbeddingDownloaded,
    getDeploymentHealthSummary,
    listIntegrations,
    checkEmbeddingStatus,
    refreshSearchApiEmbeddingStatus,
  ]);

  useEffect(() => {
    refreshMemoryKernelStatus();
  }, [refreshMemoryKernelStatus]);

  useEffect(() => {
    Promise.resolve(loadInitialState()).catch((err) =>
      console.error("Settings init failed:", err),
    );
    Promise.resolve(loadAuditEntries()).catch((err) =>
      console.error("Audit load failed:", err),
    );
  }, [loadInitialState, loadAuditEntries]);

  return {
    loadedModel,
    setLoadedModel,
    loadedModelInfo,
    setLoadedModelInfo,
    downloadedModels,
    setDownloadedModels,
    kbFolder,
    setKbFolder,
    indexStats,
    setIndexStats,
    vectorEnabled,
    setVectorEnabled,
    jiraConfigured,
    setJiraConfigured,
    contextWindowSize,
    setContextWindowSize,
    embeddingDownloaded,
    setEmbeddingDownloaded,
    allowUnverifiedLocalModels,
    setAllowUnverifiedLocalModels,
    deploymentHealth,
    setDeploymentHealth,
    integrations,
    setIntegrations,
    qualityThresholds,
    setQualityThresholds,
    memoryKernelPreflight,
    memoryKernelLoading,
    auditEntries,
    setAuditEntries,
    auditLoading,
    auditPage,
    setAuditPage,
    loadInitialState,
    loadAuditEntries,
    refreshMemoryKernelStatus,
  };
}
