// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsTab } from "./SettingsTab";

const invokeMock = vi.fn();
const openMock = vi.fn();
const saveDialogMock = vi.fn();
const showSuccess = vi.fn();
const showError = vi.fn();
const setTheme = vi.fn();

const loadModelMock = vi.fn();
const unloadModelMock = vi.fn();
const getLoadedModelMock = vi.fn();
const getModelInfoMock = vi.fn();
const listModelsMock = vi.fn();
const getContextWindowMock = vi.fn();
const setContextWindowMock = vi.fn();
const loadCustomModelMock = vi.fn();
const validateGgufFileMock = vi.fn();

const setKbFolderMock = vi.fn();
const getKbFolderMock = vi.fn();
const rebuildIndexMock = vi.fn();
const getIndexStatsMock = vi.fn();
const getVectorConsentMock = vi.fn();
const setVectorConsentMock = vi.fn();
const generateEmbeddingsMock = vi.fn();

const downloadModelMock = vi.fn();
const cancelDownloadMock = vi.fn();

const checkJiraConfigMock = vi.fn();
const configureJiraMock = vi.fn();
const disconnectJiraMock = vi.fn();

const initEmbeddingEngineMock = vi.fn();
const loadEmbeddingModelMock = vi.fn();
const unloadEmbeddingModelMock = vi.fn();
const checkEmbeddingStatusMock = vi.fn();
const isEmbeddingDownloadedMock = vi.fn();
const getEmbeddingModelPathMock = vi.fn();

const refreshSearchApiEmbeddingStatusMock = vi.fn();
const installSearchApiEmbeddingModelMock = vi.fn();

const loadVariablesMock = vi.fn();
const saveVariableMock = vi.fn();
const deleteVariableMock = vi.fn();

const getDeploymentHealthSummaryMock = vi.fn();
const runDeploymentPreflightMock = vi.fn();
const listIntegrationsMock = vi.fn();
const configureIntegrationMock = vi.fn();

let downloadState: {
  isDownloading: boolean;
  downloadProgress: null | {
    model_id: string;
    percent: number;
    downloaded_bytes: number;
    total_bytes: number;
    speed_bps: number;
  };
};
let embeddingState: {
  isLoaded: boolean;
  modelInfo: { name: string; embedding_dim: number } | null;
  loading: boolean;
};
let searchApiEmbeddingState: {
  status: {
    installed: boolean;
    ready: boolean;
    model_name: string;
    revision: string;
    local_path: string | null;
    error: string | null;
  } | null;
  loading: boolean;
  error: string | null;
};
let jiraState: {
  config: { base_url: string; email: string } | null;
  loading: boolean;
};
let customVariablesState: Array<{ id: string; name: string; value: string }>;

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: (...args: unknown[]) => openMock(...args),
  save: (...args: unknown[]) => saveDialogMock(...args),
}));

vi.mock("../shared/Button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    type,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    type?: "button" | "submit";
  }) => (
    <button type={type ?? "button"} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

vi.mock("../../hooks/useLlmModel", () => ({
  useLlmModel: () => ({
    loadModel: loadModelMock,
    unloadModel: unloadModelMock,
    getLoadedModel: getLoadedModelMock,
    getModelInfo: getModelInfoMock,
    listModels: listModelsMock,
    getContextWindow: getContextWindowMock,
    setContextWindow: setContextWindowMock,
    loadCustomModel: loadCustomModelMock,
    validateGgufFile: validateGgufFileMock,
  }),
}));

vi.mock("../../hooks/useKb", () => ({
  useKb: () => ({
    setKbFolder: setKbFolderMock,
    getKbFolder: getKbFolderMock,
    rebuildIndex: rebuildIndexMock,
    getIndexStats: getIndexStatsMock,
    getVectorConsent: getVectorConsentMock,
    setVectorConsent: setVectorConsentMock,
    generateEmbeddings: generateEmbeddingsMock,
  }),
}));

vi.mock("../../hooks/useDownload", () => ({
  useDownload: () => ({
    downloadModel: downloadModelMock,
    downloadProgress: downloadState.downloadProgress,
    isDownloading: downloadState.isDownloading,
    cancelDownload: cancelDownloadMock,
  }),
}));

vi.mock("../../hooks/useJira", () => ({
  useJira: () => ({
    checkConfiguration: checkJiraConfigMock,
    configure: configureJiraMock,
    disconnect: disconnectJiraMock,
    config: jiraState.config,
    loading: jiraState.loading,
  }),
}));

vi.mock("../../hooks/useEmbedding", () => ({
  useEmbedding: () => ({
    initEngine: initEmbeddingEngineMock,
    loadModel: loadEmbeddingModelMock,
    unloadModel: unloadEmbeddingModelMock,
    checkModelStatus: checkEmbeddingStatusMock,
    isModelDownloaded: isEmbeddingDownloadedMock,
    getModelPath: getEmbeddingModelPathMock,
    isLoaded: embeddingState.isLoaded,
    modelInfo: embeddingState.modelInfo,
    loading: embeddingState.loading,
  }),
}));

vi.mock("../../hooks/useSearchApiEmbedding", () => ({
  useSearchApiEmbedding: () => ({
    status: searchApiEmbeddingState.status,
    loading: searchApiEmbeddingState.loading,
    error: searchApiEmbeddingState.error,
    refreshStatus: refreshSearchApiEmbeddingStatusMock,
    installModel: installSearchApiEmbeddingModelMock,
  }),
}));

vi.mock("../../hooks/useCustomVariables", () => ({
  useCustomVariables: () => ({
    variables: customVariablesState,
    loadVariables: loadVariablesMock,
    saveVariable: saveVariableMock,
    deleteVariable: deleteVariableMock,
  }),
}));

vi.mock("../../hooks/useSettingsOps", () => ({
  useSettingsOps: () => ({
    getDeploymentHealthSummary: getDeploymentHealthSummaryMock,
    runDeploymentPreflight: runDeploymentPreflightMock,
    listIntegrations: listIntegrationsMock,
    configureIntegration: configureIntegrationMock,
  }),
}));

vi.mock("../../contexts/ThemeContext", () => ({
  useTheme: () => ({
    theme: "system",
    setTheme,
  }),
}));

vi.mock("../../contexts/ToastContext", () => ({
  useToastContext: () => ({
    success: showSuccess,
    error: showError,
  }),
}));

vi.mock("../../features/analytics/qualityThresholds", () => ({
  getResponseQualityThresholds: () => ({
    editRatioWatch: 0.2,
    editRatioAction: 0.4,
    timeToDraftWatchMs: 1000,
    timeToDraftActionMs: 2000,
    copyPerSaveWatch: 3,
    copyPerSaveAction: 2,
    editedSaveRateWatch: 0.2,
    editedSaveRateAction: 0.4,
  }),
  resetResponseQualityThresholds: () => ({
    editRatioWatch: 0.2,
    editRatioAction: 0.4,
    timeToDraftWatchMs: 1000,
    timeToDraftActionMs: 2000,
    copyPerSaveWatch: 3,
    copyPerSaveAction: 2,
    editedSaveRateWatch: 0.2,
    editedSaveRateAction: 0.4,
  }),
  saveResponseQualityThresholds: (value: unknown) => value,
}));

vi.mock("./sections/SettingsOverviewSections", () => ({
  SettingsHero: ({
    loadedModel,
    kbFolder,
    isEmbeddingLoaded,
  }: {
    loadedModel: string | null;
    kbFolder: string | null;
    isEmbeddingLoaded: boolean;
  }) => (
    <div>
      <div>Settings Hero</div>
      <div data-testid="hero-loaded-model">{loadedModel ?? "none"}</div>
      <div data-testid="hero-kb-folder">{kbFolder ?? "none"}</div>
      <div data-testid="hero-embedding">
        {isEmbeddingLoaded ? "loaded" : "not-loaded"}
      </div>
    </div>
  ),
  PolicyGatesSection: ({
    adminTabsEnabled,
    networkIngestEnabled,
  }: {
    adminTabsEnabled: boolean;
    networkIngestEnabled: boolean;
  }) => (
    <div>
      Policy Gates {String(adminTabsEnabled)} {String(networkIngestEnabled)}
    </div>
  ),
  MemoryKernelSection: ({
    memoryKernelPreflight,
    memoryKernelLoading,
    onRefresh,
  }: {
    memoryKernelPreflight: { status: string } | null;
    memoryKernelLoading: boolean;
    onRefresh: () => void;
  }) => (
    <div>
      <div>
        MemoryKernel{" "}
        {memoryKernelLoading
          ? "loading"
          : (memoryKernelPreflight?.status ?? "none")}
      </div>
      <button onClick={onRefresh}>Refresh Memory Kernel</button>
    </div>
  ),
  AppearanceSection: ({
    theme,
    onThemeChange,
  }: {
    theme: string;
    onThemeChange: (value: string) => void;
  }) => (
    <div>
      <div>Appearance {theme}</div>
      <button onClick={() => onThemeChange("dark")}>Switch Theme</button>
    </div>
  ),
  AboutSection: ({ versionLabel }: { versionLabel: string }) => (
    <div>{versionLabel}</div>
  ),
}));

vi.mock("./sections/SettingsOpsSections", () => ({
  DeploymentSection: ({
    deployPreflightChecks,
    onRunDeploymentPreflight,
    onToggleIntegration,
  }: {
    deployPreflightChecks: string[];
    onRunDeploymentPreflight: () => void;
    onToggleIntegration: (integrationType: string, enabled: boolean) => void;
  }) => (
    <div>
      <div data-testid="deploy-checks">{deployPreflightChecks.join(",")}</div>
      <button onClick={onRunDeploymentPreflight}>
        Run Deployment Preflight
      </button>
      <button onClick={() => onToggleIntegration("jira", true)}>
        Toggle Jira Integration
      </button>
    </div>
  ),
  BackupSection: ({
    onExportBackup,
    onImportBackup,
  }: {
    onExportBackup: () => void;
    onImportBackup: () => void;
  }) => (
    <div>
      <button onClick={onExportBackup}>Export Backup</button>
      <button onClick={onImportBackup}>Import Backup</button>
    </div>
  ),
  QualityThresholdSection: ({
    onThresholdChange,
    onSave,
    onReset,
    qualityThresholdError,
  }: {
    onThresholdChange: (key: string, value: number) => void;
    onSave: () => void;
    onReset: () => void;
    qualityThresholdError: string | null;
  }) => (
    <div>
      <button onClick={() => onThresholdChange("editRatioWatch", 0.5)}>
        Make Threshold Invalid
      </button>
      <button onClick={() => onThresholdChange("editRatioWatch", 0.2)}>
        Make Threshold Valid
      </button>
      <button onClick={onSave}>Save Thresholds</button>
      <button onClick={onReset}>Reset Thresholds</button>
      {qualityThresholdError && <div>{qualityThresholdError}</div>}
    </div>
  ),
  AuditLogsSection: ({
    filteredAuditEntriesCount,
    pagedAuditEntries,
    onRefresh,
    onExport,
    onSeverityChange,
    onSearchQueryChange,
    onPreviousPage,
    onNextPage,
  }: {
    filteredAuditEntriesCount: number;
    pagedAuditEntries: Array<{ id: string; message: string }>;
    onRefresh: () => void;
    onExport: () => void;
    onSeverityChange: (
      value: "all" | "info" | "warning" | "error" | "critical",
    ) => void;
    onSearchQueryChange: (value: string) => void;
    onPreviousPage: () => void;
    onNextPage: () => void;
  }) => (
    <div>
      <div data-testid="audit-count">{filteredAuditEntriesCount}</div>
      <div data-testid="audit-messages">
        {pagedAuditEntries.map((entry) => entry.message).join("|")}
      </div>
      <button onClick={onRefresh}>Refresh Audit Logs</button>
      <button onClick={onExport}>Export Audit Logs</button>
      <button onClick={() => onSeverityChange("error")}>Filter Errors</button>
      <button onClick={() => onSearchQueryChange("custom")}>
        Search Custom
      </button>
      <button onClick={onPreviousPage}>Previous Audit Page</button>
      <button onClick={onNextPage}>Next Audit Page</button>
    </div>
  ),
}));

function setDefaultMocks() {
  downloadState = {
    isDownloading: false,
    downloadProgress: null,
  };
  embeddingState = {
    isLoaded: false,
    modelInfo: null,
    loading: false,
  };
  searchApiEmbeddingState = {
    status: {
      installed: false,
      ready: false,
      model_name: "sentence-transformers/all-MiniLM-L6-v2",
      revision: "pinned-revision",
      local_path: null,
      error: null,
    },
    loading: false,
    error: null,
  };
  jiraState = {
    config: null,
    loading: false,
  };
  customVariablesState = [{ id: "1", name: "existing_var", value: "hello" }];

  getLoadedModelMock.mockResolvedValue(null);
  getModelInfoMock.mockResolvedValue(null);
  listModelsMock.mockResolvedValue([]);
  getKbFolderMock.mockResolvedValue(null);
  getIndexStatsMock.mockResolvedValue({ total_chunks: 12, total_files: 3 });
  getVectorConsentMock.mockResolvedValue({ enabled: true });
  checkJiraConfigMock.mockResolvedValue(false);
  getContextWindowMock.mockResolvedValue(null);
  isEmbeddingDownloadedMock.mockResolvedValue(false);
  getDeploymentHealthSummaryMock.mockResolvedValue({ healthy: true });
  listIntegrationsMock.mockResolvedValue([
    { integration_type: "jira", enabled: false },
  ]);
  checkEmbeddingStatusMock.mockResolvedValue(false);
  refreshSearchApiEmbeddingStatusMock.mockResolvedValue(
    searchApiEmbeddingState.status,
  );
  setVectorConsentMock.mockResolvedValue(undefined);
  loadVariablesMock.mockResolvedValue(undefined);
  saveVariableMock.mockResolvedValue(true);
  deleteVariableMock.mockResolvedValue(true);
  configureJiraMock.mockResolvedValue(undefined);
  disconnectJiraMock.mockResolvedValue(undefined);
  loadModelMock.mockResolvedValue({
    id: "llama-3.1-8b-instruct",
    name: "Llama 3.1 8B Instruct",
    verification_status: "verified",
  });
  unloadModelMock.mockResolvedValue(undefined);
  downloadModelMock.mockResolvedValue(undefined);
  cancelDownloadMock.mockResolvedValue(undefined);
  initEmbeddingEngineMock.mockResolvedValue(undefined);
  getEmbeddingModelPathMock.mockResolvedValue("/models/nomic.gguf");
  loadEmbeddingModelMock.mockResolvedValue(undefined);
  unloadEmbeddingModelMock.mockResolvedValue(undefined);
  setContextWindowMock.mockResolvedValue(undefined);
  validateGgufFileMock.mockResolvedValue({
    is_valid: true,
    file_name: "trusted.gguf",
    integrity_status: "verified",
  });
  loadCustomModelMock.mockResolvedValue({
    id: "custom",
    name: "Custom",
    verification_status: "verified",
  });
  openMock.mockResolvedValue("/tmp/selected.gguf");
  saveDialogMock.mockResolvedValue("/tmp/audit.json");
  runDeploymentPreflightMock.mockResolvedValue({
    ok: true,
    checks: ["bundle", "tests"],
  });
  configureIntegrationMock.mockResolvedValue(undefined);
  installSearchApiEmbeddingModelMock.mockResolvedValue({
    ready: true,
    error: null,
  });
  generateEmbeddingsMock.mockResolvedValue({ chunks_processed: 5 });

  invokeMock.mockImplementation(
    (command: string, args?: Record<string, unknown>) => {
      if (command === "get_allow_unverified_local_models") {
        return Promise.resolve(false);
      }
      if (command === "get_audit_entries") {
        return Promise.resolve([
          {
            id: "1",
            severity: "info",
            event: "key_generated",
            message: "baseline message",
          },
          {
            id: "2",
            severity: "error",
            event: { custom: "custom-event" },
            message: "custom message",
          },
        ]);
      }
      if (command === "get_memory_kernel_preflight_status") {
        return Promise.resolve({
          status: "ready",
          service_contract_version: "v1",
        });
      }
      if (command === "set_allow_unverified_local_models") {
        return Promise.resolve(args);
      }
      if (command === "export_backup") {
        return Promise.resolve({
          drafts_count: 2,
          templates_count: 1,
          variables_count: 1,
          trees_count: 0,
          path: "/tmp/export.json",
        });
      }
      if (command === "import_backup") {
        return Promise.resolve({
          drafts_imported: 2,
          templates_imported: 1,
          variables_imported: 1,
          trees_imported: 0,
        });
      }
      if (command === "export_audit_log") {
        return Promise.resolve("/tmp/audit.json");
      }
      return Promise.resolve(null);
    },
  );
}

beforeEach(() => {
  setDefaultMocks();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  invokeMock.mockReset();
  openMock.mockReset();
  saveDialogMock.mockReset();
  showSuccess.mockReset();
  showError.mockReset();
  setTheme.mockReset();
  loadModelMock.mockReset();
  unloadModelMock.mockReset();
  getLoadedModelMock.mockReset();
  getModelInfoMock.mockReset();
  listModelsMock.mockReset();
  getContextWindowMock.mockReset();
  setContextWindowMock.mockReset();
  loadCustomModelMock.mockReset();
  validateGgufFileMock.mockReset();
  setKbFolderMock.mockReset();
  getKbFolderMock.mockReset();
  rebuildIndexMock.mockReset();
  getIndexStatsMock.mockReset();
  getVectorConsentMock.mockReset();
  setVectorConsentMock.mockReset();
  generateEmbeddingsMock.mockReset();
  downloadModelMock.mockReset();
  cancelDownloadMock.mockReset();
  checkJiraConfigMock.mockReset();
  configureJiraMock.mockReset();
  disconnectJiraMock.mockReset();
  initEmbeddingEngineMock.mockReset();
  loadEmbeddingModelMock.mockReset();
  unloadEmbeddingModelMock.mockReset();
  checkEmbeddingStatusMock.mockReset();
  isEmbeddingDownloadedMock.mockReset();
  getEmbeddingModelPathMock.mockReset();
  refreshSearchApiEmbeddingStatusMock.mockReset();
  installSearchApiEmbeddingModelMock.mockReset();
  loadVariablesMock.mockReset();
  saveVariableMock.mockReset();
  deleteVariableMock.mockReset();
  getDeploymentHealthSummaryMock.mockReset();
  runDeploymentPreflightMock.mockReset();
  listIntegrationsMock.mockReset();
  configureIntegrationMock.mockReset();
});

describe("SettingsTab", () => {
  it("renders semantic-search model cards and persists the advanced local-model toggle", async () => {
    const user = userEvent.setup();
    render(<SettingsTab />);

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Semantic Search Models" }),
      ).toBeTruthy();
    });

    expect(
      screen.getByRole("heading", { name: "Desktop Embedding Model" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Search API Embedding Model" }),
    ).toBeTruthy();

    const toggle = screen.getByLabelText(
      "Allow unverified local models (advanced)",
    );
    await user.click(toggle);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        "set_allow_unverified_local_models",
        { enabled: true },
      );
    });
  });

  it("covers model, embedding, and context-window interactions", async () => {
    const user = userEvent.setup();
    listModelsMock.mockResolvedValue(["llama-3.1-8b-instruct"]);
    getLoadedModelMock.mockResolvedValue("llama-3.1-8b-instruct");
    getModelInfoMock.mockResolvedValue({
      id: "llama-3.1-8b-instruct",
      name: "Llama 3.1 8B Instruct",
      verification_status: "verified",
    });
    getContextWindowMock.mockResolvedValue(4096);
    isEmbeddingDownloadedMock.mockResolvedValue(true);
    embeddingState.isLoaded = true;
    embeddingState.modelInfo = { name: "nomic-embed-text", embedding_dim: 768 };

    render(<SettingsTab />);

    await screen.findByText("Currently loaded:");
    await user.click(screen.getAllByRole("button", { name: "Unload" })[0]);
    await waitFor(() => expect(unloadModelMock).toHaveBeenCalled());

    await user.click(
      screen.getByRole("button", { name: "Show other supported models" }),
    );
    await user.click(screen.getAllByRole("button", { name: "Load" })[0]);
    await waitFor(() =>
      expect(loadModelMock).toHaveBeenCalledWith("llama-3.1-8b-instruct"),
    );

    await user.selectOptions(
      screen.getByLabelText("Context window size"),
      "8192",
    );
    await waitFor(() =>
      expect(setContextWindowMock).toHaveBeenCalledWith(8192),
    );

    await user.click(screen.getAllByRole("button", { name: "Unload" }).at(-1)!);
    await waitFor(() => expect(unloadEmbeddingModelMock).toHaveBeenCalled());

    await user.click(
      screen.getByRole("button", { name: "Generate Embeddings for KB" }),
    );
    await waitFor(() => expect(generateEmbeddingsMock).toHaveBeenCalled());

    await user.click(screen.getByRole("button", { name: "Install Model" }));
    await waitFor(() =>
      expect(installSearchApiEmbeddingModelMock).toHaveBeenCalled(),
    );
    await user.click(screen.getByRole("button", { name: "Refresh Status" }));
    await waitFor(() =>
      expect(refreshSearchApiEmbeddingStatusMock).toHaveBeenCalled(),
    );
  });

  it("handles custom model validation branches and KB selection", async () => {
    const user = userEvent.setup();
    render(<SettingsTab />);

    validateGgufFileMock.mockResolvedValueOnce({
      is_valid: false,
      file_name: "broken.gguf",
      integrity_status: "verified",
    });
    await user.click(
      screen.getByRole("button", { name: "Select GGUF File..." }),
    );
    await screen.findByText(/invalid gguf file: broken\.gguf/i);

    validateGgufFileMock.mockResolvedValueOnce({
      is_valid: true,
      file_name: "untrusted.gguf",
      integrity_status: "unverified",
    });
    await user.click(
      screen.getByRole("button", { name: "Select GGUF File..." }),
    );
    await screen.findByText(/not on the verified allowlist/i);

    await user.click(
      screen.getByLabelText("Allow unverified local models (advanced)"),
    );
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith(
        "set_allow_unverified_local_models",
        { enabled: true },
      ),
    );
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    validateGgufFileMock.mockResolvedValueOnce({
      is_valid: true,
      file_name: "untrusted.gguf",
      integrity_status: "unverified",
    });
    await user.click(
      screen.getByRole("button", { name: "Select GGUF File..." }),
    );
    await waitFor(() =>
      expect(loadCustomModelMock).toHaveBeenCalledWith("/tmp/selected.gguf"),
    );
    expect(confirmSpy).toHaveBeenCalled();

    openMock.mockResolvedValueOnce("/tmp/kb");
    await user.click(screen.getByRole("button", { name: "Select Folder" }));
    await waitFor(() =>
      expect(setKbFolderMock).toHaveBeenCalledWith("/tmp/kb"),
    );
  });

  it("covers variables, Jira, backup, deployment, audit, and threshold operations", async () => {
    const user = userEvent.setup();
    render(<SettingsTab />);

    await screen.findByText("Template Variables");

    await user.click(screen.getByRole("button", { name: "+ Add Variable" }));
    await user.type(screen.getByLabelText("Name"), "1bad");
    await user.type(screen.getByLabelText("Value"), "value");
    await user.click(screen.getByRole("button", { name: "Add" }));
    await screen.findByText(/must start with a letter or underscore/i);

    await user.clear(screen.getByLabelText("Name"));
    await user.type(screen.getByLabelText("Name"), "existing_var");
    await user.click(screen.getByRole("button", { name: "Add" }));
    await screen.findByText(/already exists/i);

    await user.clear(screen.getByLabelText("Name"));
    await user.type(screen.getByLabelText("Name"), "new_var");
    await user.clear(screen.getByLabelText("Value"));
    await user.type(screen.getByLabelText("Value"), "new value");
    await user.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() =>
      expect(saveVariableMock).toHaveBeenCalledWith(
        "new_var",
        "new value",
        undefined,
      ),
    );

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deleteVariableMock).toHaveBeenCalledWith("1"));

    await user.type(
      screen.getByLabelText("Jira URL"),
      "https://example.atlassian.net",
    );
    await user.type(screen.getByLabelText("Email"), "dev@example.com");
    await user.type(screen.getByLabelText("API Token"), "secret");
    await user.click(screen.getByRole("button", { name: "Connect" }));
    await waitFor(() =>
      expect(configureJiraMock).toHaveBeenCalledWith(
        "https://example.atlassian.net",
        "dev@example.com",
        "secret",
      ),
    );

    jiraState.config = {
      base_url: "https://example.atlassian.net",
      email: "dev@example.com",
    };
    checkJiraConfigMock.mockResolvedValue(true);
    cleanup();
    render(<SettingsTab />);
    await screen.findByText(/connected to https:\/\/example\.atlassian\.net/i);
    await user.click(screen.getByRole("button", { name: "Disconnect" }));
    await waitFor(() => expect(disconnectJiraMock).toHaveBeenCalled());

    await user.click(screen.getByRole("button", { name: "Export Backup" }));
    await user.click(screen.getByRole("button", { name: "Import Backup" }));
    await user.click(
      screen.getByRole("button", { name: "Run Deployment Preflight" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Toggle Jira Integration" }),
    );
    await user.click(screen.getByRole("button", { name: "Export Audit Logs" }));
    await user.click(screen.getByRole("button", { name: "Filter Errors" }));
    await user.click(screen.getByRole("button", { name: "Search Custom" }));
    await user.click(
      screen.getByRole("button", { name: "Refresh Audit Logs" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Make Threshold Invalid" }),
    );
    await user.click(screen.getByRole("button", { name: "Save Thresholds" }));
    await screen.findByText(/edit ratio watch threshold must be lower/i);
    await user.click(
      screen.getByRole("button", { name: "Make Threshold Valid" }),
    );
    await user.click(screen.getByRole("button", { name: "Reset Thresholds" }));
    await user.click(screen.getByRole("button", { name: "Save Thresholds" }));
    await user.click(screen.getByRole("button", { name: "Switch Theme" }));
    await user.click(
      screen.getByRole("button", { name: "Refresh Memory Kernel" }),
    );

    await waitFor(() => {
      expect(runDeploymentPreflightMock).toHaveBeenCalledWith("stable");
      expect(configureIntegrationMock).toHaveBeenCalledWith("jira", true);
      expect(saveDialogMock).toHaveBeenCalled();
      expect(setTheme).toHaveBeenCalledWith("dark");
      expect(showSuccess).toHaveBeenCalledWith(
        "Response quality coaching thresholds updated",
      );
    });
  });
});
