import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useState } from "react";
import appPackage from "../../../package.json";
import { useTheme } from "../../contexts/ThemeContext";
import { useToastContext } from "../../contexts/ToastContext";
import {
  type ResponseQualityThresholds,
  resetResponseQualityThresholds,
  saveResponseQualityThresholds,
} from "../../features/analytics/qualityThresholds";
import { resolveRevampFlags } from "../../features/revamp/flags";
import { useCustomVariables } from "../../hooks/useCustomVariables";
import { useDownload } from "../../hooks/useDownload";
import { useEmbedding } from "../../hooks/useEmbedding";
import { useJira } from "../../hooks/useJira";
import { useKb } from "../../hooks/useKb";
import { useLlm } from "../../hooks/useLlm";
import { useSearchApiEmbedding } from "../../hooks/useSearchApiEmbedding";
import { useSettingsOps } from "../../hooks/useSettingsOps";
import {
  formatAuditEvent,
  formatBytes,
  formatSpeed,
  formatVerificationStatus,
  getSearchApiEmbeddingBadge,
  validateQualityThresholds,
} from "./SettingsTab.helpers";
import { useSettingsInit } from "./useSettingsInit";
import { AdvancedSearchSection } from "./sections/AdvancedSearchSection";
import { ContextWindowSection } from "./sections/ContextWindowSection";
import { JiraSection } from "./sections/JiraSection";
import { KbSection } from "./sections/KbSection";
import { ModelSection } from "./sections/ModelSection";
import { SemanticSearchSection } from "./sections/SemanticSearchSection";
import {
  AuditLogsSection,
  BackupSection,
  DeploymentSection,
  QualityThresholdSection,
} from "./sections/SettingsOpsSections";
import {
  AboutSection,
  AppearanceSection,
  MemoryKernelSection,
  PolicyGatesSection,
  SettingsHero,
} from "./sections/SettingsOverviewSections";
import { VariablesSection } from "./sections/VariablesSection";
import { formatAppVersion } from "./versionLabel";
import "./SettingsTab.css";

export {
  formatAuditEvent,
  formatBytes,
  formatSpeed,
  formatVerificationStatus,
  getSearchApiEmbeddingBadge,
  validateQualityThresholds,
};

const APP_VERSION = appPackage.version;
const AUDIT_PAGE_SIZE = 50;

export function SettingsTab() {
  const {
    loadModel,
    unloadModel,
    getLoadedModel,
    getModelInfo,
    listModels,
    getContextWindow,
    setContextWindow,
    loadCustomModel,
    validateGgufFile,
  } = useLlm();
  const {
    setKbFolder,
    getKbFolder,
    rebuildIndex,
    getIndexStats,
    getVectorConsent,
    setVectorConsent,
    generateEmbeddings,
  } = useKb();
  const { downloadModel, downloadProgress, isDownloading, cancelDownload } =
    useDownload();
  const {
    checkConfiguration: checkJiraConfig,
    configure: configureJira,
    disconnect: disconnectJira,
    config: jiraConfig,
    loading: jiraLoading,
  } = useJira();
  const {
    initEngine: initEmbeddingEngine,
    loadModel: loadEmbeddingModel,
    unloadModel: unloadEmbeddingModel,
    checkModelStatus: checkEmbeddingStatus,
    isModelDownloaded: isEmbeddingDownloaded,
    getModelPath: getEmbeddingModelPath,
    isLoaded: isEmbeddingLoaded,
    modelInfo: embeddingModelInfo,
    loading: embeddingLoading,
  } = useEmbedding();
  const {
    status: searchApiEmbeddingStatus,
    loading: searchApiEmbeddingLoading,
    error: searchApiEmbeddingError,
    refreshStatus: refreshSearchApiEmbeddingStatus,
    installModel: installSearchApiEmbeddingModel,
  } = useSearchApiEmbedding();
  const {
    getDeploymentHealthSummary,
    runDeploymentPreflight,
    listIntegrations,
    configureIntegration,
  } = useSettingsOps();
  const { theme, setTheme } = useTheme();
  const { success: showSuccess, error: showError } = useToastContext();
  const {
    variables: customVariables,
    loadVariables,
    saveVariable,
    deleteVariable,
  } = useCustomVariables();

  const init = useSettingsInit({
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
    onShowError: showError,
  });

  const {
    loadedModel,
    setLoadedModel,
    loadedModelInfo,
    setLoadedModelInfo,
    downloadedModels,
    setDownloadedModels,
    kbFolder,
    setKbFolder: setKbFolderState,
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
    auditLoading,
    auditPage,
    setAuditPage,
    loadInitialState,
    loadAuditEntries,
    refreshMemoryKernelStatus,
  } = init;

  const [generatingEmbeddings, setGeneratingEmbeddings] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [backupLoading, setBackupLoading] = useState<
    "export" | "import" | null
  >(null);
  const [auditExporting, setAuditExporting] = useState(false);
  const [auditSeverityFilter, setAuditSeverityFilter] = useState<
    "all" | "info" | "warning" | "error" | "critical"
  >("all");
  const [auditSearchQuery, setAuditSearchQuery] = useState("");
  const [deployPreflightChecks, setDeployPreflightChecks] = useState<string[]>(
    [],
  );
  const [deployPreflightRunning, setDeployPreflightRunning] = useState(false);
  const [qualityThresholdError, setQualityThresholdError] = useState<
    string | null
  >(null);
  const revampFlags = useMemo(() => resolveRevampFlags(), []);

  const filteredAuditEntries = useMemo(() => {
    const normalized = auditEntries.slice().reverse();
    const query = auditSearchQuery.trim().toLowerCase();
    return normalized.filter((entry) => {
      if (
        auditSeverityFilter !== "all" &&
        entry.severity !== auditSeverityFilter
      ) {
        return false;
      }
      if (!query) {
        return true;
      }
      const eventText = formatAuditEvent(entry.event).toLowerCase();
      return (
        eventText.includes(query) || entry.message.toLowerCase().includes(query)
      );
    });
  }, [auditEntries, auditSearchQuery, auditSeverityFilter]);

  const auditTotalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredAuditEntries.length / AUDIT_PAGE_SIZE)),
    [filteredAuditEntries.length],
  );

  useEffect(() => {
    setAuditPage((prev) => Math.min(prev, auditTotalPages));
  }, [auditTotalPages, setAuditPage]);

  const pagedAuditEntries = useMemo(() => {
    const start = (auditPage - 1) * AUDIT_PAGE_SIZE;
    return filteredAuditEntries.slice(start, start + AUDIT_PAGE_SIZE);
  }, [filteredAuditEntries, auditPage]);

  useEffect(() => {
    Promise.resolve(loadVariables()).catch((err) =>
      console.error("Variables load failed:", err),
    );
  }, [loadVariables]);

  async function handleVectorToggle() {
    const newValue = !vectorEnabled;
    try {
      await setVectorConsent(newValue);
      setVectorEnabled(newValue);
    } catch (err) {
      setError(`Failed to update vector consent: ${err}`);
    }
  }

  async function handleJiraConnect(
    baseUrl: string,
    email: string,
    apiToken: string,
  ) {
    setError(null);
    try {
      await configureJira(baseUrl, email, apiToken);
      setJiraConfigured(true);
    } catch (err) {
      setError(`Failed to connect to Jira: ${err}`);
    }
  }

  async function handleJiraDisconnect() {
    setError(null);
    try {
      await disconnectJira();
      setJiraConfigured(false);
    } catch (err) {
      setError(`Failed to disconnect Jira: ${err}`);
    }
  }

  async function handleLoadModel(modelId: string) {
    setLoading(modelId);
    setError(null);
    try {
      const info = await loadModel(modelId);
      setLoadedModel(modelId);
      setLoadedModelInfo(info);
    } catch (err) {
      setError(`Failed to load model: ${err}`);
    } finally {
      setLoading(null);
    }
  }

  async function handleUnloadModel() {
    setLoading("unload");
    setError(null);
    try {
      await unloadModel();
      setLoadedModel(null);
      setLoadedModelInfo(null);
    } catch (err) {
      setError(`Failed to unload model: ${err}`);
    } finally {
      setLoading(null);
    }
  }

  async function handleDownloadModel(modelId: string) {
    setError(null);
    try {
      await downloadModel(modelId);
      setDownloadedModels((prev) => [...prev, modelId]);
    } catch (err) {
      setError(`Failed to download model: ${err}`);
    }
  }

  async function handleLoadCustomModel() {
    setError(null);
    setLoading("custom");
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        multiple: false,
        filters: [{ name: "GGUF Model", extensions: ["gguf"] }],
        title: "Select GGUF Model File",
      });

      if (selected && typeof selected === "string") {
        const validation = await validateGgufFile(selected);
        if (!validation.is_valid) {
          setError(
            `Invalid GGUF file: ${validation.file_name}. Please select a valid GGUF model file.`,
          );
          return;
        }

        if (
          validation.integrity_status === "unverified" &&
          !allowUnverifiedLocalModels
        ) {
          setError(
            "This GGUF file is not on the verified allowlist. Enable the advanced override below if you need to load an unverified local model.",
          );
          return;
        }

        if (
          validation.integrity_status === "unverified" &&
          allowUnverifiedLocalModels &&
          !window.confirm(
            "This GGUF file is not verified. Load it anyway? Only continue if you trust the file source.",
          )
        ) {
          return;
        }

        const info = await loadCustomModel(selected);
        setLoadedModel(validation.file_name);
        setLoadedModelInfo(info);
        showSuccess(
          validation.integrity_status === "verified"
            ? `Loaded verified custom model: ${validation.file_name}`
            : `Loaded unverified custom model: ${validation.file_name}`,
        );
      }
    } catch (err) {
      setError(`Failed to load custom model: ${err}`);
    } finally {
      setLoading(null);
    }
  }

  async function handleSelectKbFolder() {
    setError(null);
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select Knowledge Base Folder",
      });
      if (selected && typeof selected === "string") {
        await setKbFolder(selected);
        setKbFolderState(selected);
        const stats = await getIndexStats().catch(() => null);
        setIndexStats(stats);
      }
    } catch (err) {
      setError(`Failed to set KB folder: ${err}`);
    }
  }

  async function handleRebuildIndex() {
    if (!kbFolder) return;
    setLoading("rebuild");
    setError(null);
    try {
      await rebuildIndex();
      const stats = await getIndexStats();
      setIndexStats(stats);
    } catch (err) {
      setError(`Failed to rebuild index: ${err}`);
    } finally {
      setLoading(null);
    }
  }

  async function handleContextWindowChange(value: string) {
    const newSize = value === "" ? null : parseInt(value, 10);
    setError(null);
    try {
      await setContextWindow(newSize);
      setContextWindowSize(newSize);
      showSuccess("Context window updated");
    } catch (err) {
      setError(`Failed to update context window: ${err}`);
    }
  }

  async function handleDownloadEmbeddingModel() {
    setError(null);
    try {
      await downloadModel("nomic-embed-text");
      setEmbeddingDownloaded(true);
      showSuccess("Embedding model downloaded");
    } catch (err) {
      setError(`Failed to download embedding model: ${err}`);
    }
  }

  async function handleLoadEmbeddingModel() {
    setError(null);
    try {
      await initEmbeddingEngine();
      const path = await getEmbeddingModelPath("nomic-embed-text");
      if (!path) {
        showError("Embedding model file not found. Try re-downloading.");
        return;
      }
      await loadEmbeddingModel(path);
      showSuccess("Embedding model loaded");
    } catch (err) {
      const msg = `Failed to load embedding model: ${err}`;
      showError(msg);
      setError(msg);
    }
  }

  async function handleUnloadEmbeddingModel() {
    setError(null);
    try {
      await unloadEmbeddingModel();
      showSuccess("Embedding model unloaded");
    } catch (err) {
      setError(`Failed to unload embedding model: ${err}`);
    }
  }

  async function handleSetAllowUnverifiedLocalModels(enabled: boolean) {
    setError(null);
    try {
      await invoke("set_allow_unverified_local_models", { enabled });
      setAllowUnverifiedLocalModels(enabled);
      showSuccess(
        enabled
          ? "Advanced override enabled. Unverified local GGUF models now require confirmation before loading."
          : "Advanced override disabled. Only verified local GGUF models can be loaded.",
      );
    } catch (err) {
      setError(`Failed to update advanced model setting: ${err}`);
    }
  }

  async function handleInstallSearchApiEmbeddingModel() {
    setError(null);
    try {
      const status = await installSearchApiEmbeddingModel();
      if (status.ready) {
        showSuccess("Search API embedding model installed");
      } else {
        showError(
          status.error ??
            "Search API embedding model install completed, but it is not ready yet.",
        );
      }
    } catch (err) {
      setError(`Failed to install search API embedding model: ${err}`);
    }
  }

  async function handleGenerateEmbeddings() {
    if (!vectorEnabled || !isEmbeddingLoaded) {
      setError("Vector search and embedding model must be enabled");
      return;
    }
    setGeneratingEmbeddings(true);
    setError(null);
    try {
      const result = await generateEmbeddings();
      showSuccess(`Generated embeddings for ${result.chunks_processed} chunks`);
    } catch (err) {
      showError(`Failed to generate embeddings: ${err}`);
    } finally {
      setGeneratingEmbeddings(false);
    }
  }

  const handleExportBackup = useCallback(async () => {
    setBackupLoading("export");
    setError(null);
    try {
      const result = await invoke<{
        drafts_count: number;
        templates_count: number;
        variables_count: number;
        trees_count: number;
        path: string;
      }>("export_backup");
      showSuccess(
        `Exported ${result.drafts_count} drafts, ${result.templates_count} templates, ${result.variables_count} variables, ${result.trees_count} trees`,
      );
    } catch (err) {
      if (String(err) !== "Export cancelled") {
        showError(`Export failed: ${err}`);
      }
    } finally {
      setBackupLoading(null);
    }
  }, [showSuccess, showError]);

  const handleImportBackup = useCallback(async () => {
    setBackupLoading("import");
    setError(null);
    try {
      const result = await invoke<{
        drafts_imported: number;
        templates_imported: number;
        variables_imported: number;
        trees_imported: number;
      }>("import_backup");
      showSuccess(
        `Imported ${result.drafts_imported} drafts, ${result.templates_imported} templates, ${result.variables_imported} variables, ${result.trees_imported} trees`,
      );
      loadInitialState();
      loadVariables();
    } catch (err) {
      if (String(err) !== "Import cancelled") {
        showError(`Import failed: ${err}`);
      }
    } finally {
      setBackupLoading(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSuccess, showError, loadVariables]);

  const handleExportAuditLog = useCallback(async () => {
    setAuditExporting(true);
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const path = await save({
        title: "Export Audit Log",
        defaultPath: "assist-support-audit.json",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!path) {
        setAuditExporting(false);
        return;
      }
      const output = await invoke<string>("export_audit_log", {
        exportPath: path,
      });
      showSuccess(`Audit log exported to ${output}`);
    } catch (err) {
      if (String(err) !== "Export cancelled") {
        showError(`Audit export failed: ${err}`);
      }
    } finally {
      setAuditExporting(false);
    }
  }, [showSuccess, showError]);

  const handleRunDeploymentPreflight = useCallback(async () => {
    setDeployPreflightRunning(true);
    try {
      const result = await runDeploymentPreflight("stable");
      setDeployPreflightChecks(result.checks);
      const latest = await getDeploymentHealthSummary().catch(() => null);
      setDeploymentHealth(latest);
      if (result.ok) {
        showSuccess("Deployment preflight passed");
      } else {
        showError("Deployment preflight reported failures");
      }
    } catch (err) {
      showError(`Deployment preflight failed: ${err}`);
    } finally {
      setDeployPreflightRunning(false);
    }
  }, [
    runDeploymentPreflight,
    getDeploymentHealthSummary,
    setDeploymentHealth,
    showSuccess,
    showError,
  ]);

  const handleToggleIntegration = useCallback(
    async (integrationType: string, enabled: boolean) => {
      try {
        await configureIntegration(integrationType, enabled);
        const updated = await listIntegrations();
        setIntegrations(updated ?? []);
      } catch (err) {
        showError(`Failed to update ${integrationType}: ${err}`);
      }
    },
    [configureIntegration, listIntegrations, setIntegrations, showError],
  );

  const updateQualityThreshold = useCallback(
    <K extends keyof ResponseQualityThresholds>(key: K, value: number) => {
      setQualityThresholds((prev) => ({ ...prev, [key]: value }));
      setQualityThresholdError(null);
    },
    [setQualityThresholds],
  );

  const handleSaveQualityThresholds = useCallback(() => {
    const validationError = validateQualityThresholds(qualityThresholds);
    if (validationError) {
      setQualityThresholdError(validationError);
      return;
    }
    const saved = saveResponseQualityThresholds(qualityThresholds);
    setQualityThresholds(saved);
    setQualityThresholdError(null);
    showSuccess("Response quality coaching thresholds updated");
  }, [qualityThresholds, setQualityThresholds, showSuccess]);

  const handleResetQualityThresholds = useCallback(() => {
    const defaults = resetResponseQualityThresholds();
    setQualityThresholds(defaults);
    setQualityThresholdError(null);
    showSuccess("Response quality coaching thresholds reset to defaults");
  }, [setQualityThresholds, showSuccess]);

  const searchApiEmbeddingBadge = getSearchApiEmbeddingBadge(
    searchApiEmbeddingStatus,
    searchApiEmbeddingError,
  );

  return (
    <div className="settings-tab">
      {error && <div className="settings-error">{error}</div>}

      <SettingsHero
        loadedModel={loadedModel}
        kbFolder={kbFolder}
        isEmbeddingLoaded={isEmbeddingLoaded}
        embeddingDownloaded={embeddingDownloaded}
        memoryKernelPreflight={memoryKernelPreflight}
      />

      <PolicyGatesSection
        adminTabsEnabled={revampFlags.ASSISTSUPPORT_ENABLE_ADMIN_TABS}
        networkIngestEnabled={revampFlags.ASSISTSUPPORT_ENABLE_NETWORK_INGEST}
      />

      <MemoryKernelSection
        memoryKernelPreflight={memoryKernelPreflight}
        memoryKernelLoading={memoryKernelLoading}
        onRefresh={() => {
          void refreshMemoryKernelStatus();
        }}
      />

      <AppearanceSection theme={theme} onThemeChange={setTheme} />

      <ModelSection
        loadedModel={loadedModel}
        loadedModelInfo={loadedModelInfo}
        downloadedModels={downloadedModels}
        isEmbeddingLoaded={isEmbeddingLoaded}
        searchApiEmbeddingStatus={searchApiEmbeddingStatus}
        kbFolder={kbFolder}
        memoryKernelPreflight={memoryKernelPreflight}
        memoryKernelLoading={memoryKernelLoading}
        allowUnverifiedLocalModels={allowUnverifiedLocalModels}
        loading={loading}
        isDownloading={isDownloading}
        downloadProgress={downloadProgress}
        onLoadModel={(modelId) => {
          void handleLoadModel(modelId);
        }}
        onUnloadModel={() => {
          void handleUnloadModel();
        }}
        onDownloadModel={(modelId) => {
          void handleDownloadModel(modelId);
        }}
        onCancelDownload={cancelDownload}
        onLoadCustomModel={() => {
          void handleLoadCustomModel();
        }}
        onAllowUnverifiedLocalModelsChange={(enabled) => {
          void handleSetAllowUnverifiedLocalModels(enabled);
        }}
        onRefreshMemoryKernel={() => {
          void refreshMemoryKernelStatus();
        }}
      />

      <ContextWindowSection
        loadedModel={loadedModel}
        contextWindowSize={contextWindowSize}
        onContextWindowChange={(value) => {
          void handleContextWindowChange(value);
        }}
      />

      <SemanticSearchSection
        embeddingDownloaded={embeddingDownloaded}
        isEmbeddingLoaded={isEmbeddingLoaded}
        embeddingLoading={embeddingLoading}
        embeddingModelInfo={embeddingModelInfo}
        vectorEnabled={vectorEnabled}
        generatingEmbeddings={generatingEmbeddings}
        isDownloading={isDownloading}
        downloadProgress={downloadProgress}
        searchApiEmbeddingStatus={searchApiEmbeddingStatus}
        searchApiEmbeddingLoading={searchApiEmbeddingLoading}
        searchApiEmbeddingBadge={searchApiEmbeddingBadge}
        onCancelDownload={cancelDownload}
        onDownloadEmbeddingModel={() => {
          void handleDownloadEmbeddingModel();
        }}
        onLoadEmbeddingModel={() => {
          void handleLoadEmbeddingModel();
        }}
        onUnloadEmbeddingModel={() => {
          void handleUnloadEmbeddingModel();
        }}
        onGenerateEmbeddings={() => {
          void handleGenerateEmbeddings();
        }}
        onInstallSearchApiEmbeddingModel={() => {
          void handleInstallSearchApiEmbeddingModel();
        }}
        onRefreshSearchApiEmbeddingStatus={() => {
          void refreshSearchApiEmbeddingStatus();
        }}
      />

      <KbSection
        kbFolder={kbFolder}
        indexStats={indexStats}
        loading={loading}
        onSelectKbFolder={() => {
          void handleSelectKbFolder();
        }}
        onRebuildIndex={() => {
          void handleRebuildIndex();
        }}
      />

      <AdvancedSearchSection
        vectorEnabled={vectorEnabled}
        onVectorToggle={() => {
          void handleVectorToggle();
        }}
      />

      <VariablesSection
        customVariables={customVariables}
        onSaveVariable={saveVariable}
        onDeleteVariable={deleteVariable}
        onShowSuccess={showSuccess}
        onShowError={showError}
      />

      <JiraSection
        jiraConfigured={jiraConfigured}
        jiraConfig={jiraConfig}
        jiraLoading={jiraLoading}
        onJiraConnect={handleJiraConnect}
        onJiraDisconnect={handleJiraDisconnect}
      />

      <DeploymentSection
        deploymentHealth={deploymentHealth}
        deployPreflightChecks={deployPreflightChecks}
        deployPreflightRunning={deployPreflightRunning}
        integrations={integrations}
        onRunDeploymentPreflight={() => {
          void handleRunDeploymentPreflight();
        }}
        onToggleIntegration={(integrationType, enabled) => {
          void handleToggleIntegration(integrationType, enabled);
        }}
      />

      <BackupSection
        backupLoading={backupLoading}
        onExportBackup={() => {
          void handleExportBackup();
        }}
        onImportBackup={() => {
          void handleImportBackup();
        }}
      />

      <QualityThresholdSection
        qualityThresholds={qualityThresholds}
        qualityThresholdError={qualityThresholdError}
        onThresholdChange={updateQualityThreshold}
        onSave={handleSaveQualityThresholds}
        onReset={handleResetQualityThresholds}
      />

      <AuditLogsSection
        auditLoading={auditLoading}
        auditExporting={auditExporting}
        auditSeverityFilter={auditSeverityFilter}
        auditSearchQuery={auditSearchQuery}
        filteredAuditEntriesCount={filteredAuditEntries.length}
        pagedAuditEntries={pagedAuditEntries}
        auditPage={auditPage}
        auditTotalPages={auditTotalPages}
        formatAuditEvent={formatAuditEvent}
        onRefresh={() => {
          void loadAuditEntries();
        }}
        onExport={() => {
          void handleExportAuditLog();
        }}
        onSeverityChange={(value) => {
          setAuditSeverityFilter(value);
          setAuditPage(1);
        }}
        onSearchQueryChange={(value) => {
          setAuditSearchQuery(value);
          setAuditPage(1);
        }}
        onPreviousPage={() => setAuditPage((p) => Math.max(1, p - 1))}
        onNextPage={() => setAuditPage((p) => Math.min(auditTotalPages, p + 1))}
      />

      <AboutSection versionLabel={formatAppVersion(APP_VERSION)} />
    </div>
  );
}
