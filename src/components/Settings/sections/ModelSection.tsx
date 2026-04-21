import { useState } from "react";
import type { DownloadProgress, ModelInfo } from "../../../types/llm";
import type {
  MemoryKernelPreflightStatus,
  SearchApiEmbeddingModelStatus,
} from "../../../types/settings";
import { Button } from "../../shared/Button";
import {
  formatBytes,
  formatSpeed,
  formatVerificationStatus,
} from "../SettingsTab.helpers";

const RECOMMENDED_MODELS: ModelInfo[] = [
  {
    id: "llama-3.1-8b-instruct",
    name: "Llama 3.1 8B Instruct",
    size: "4.9 GB",
    description: "Recommended: higher quality and more reliable grounding",
  },
];

const OTHER_SUPPORTED_MODELS: ModelInfo[] = [
  {
    id: "llama-3.2-1b-instruct",
    name: "Llama 3.2 1B Instruct",
    size: "1.3 GB",
    description: "Fast, lightweight model for quick responses",
  },
  {
    id: "llama-3.2-3b-instruct",
    name: "Llama 3.2 3B Instruct",
    size: "2.0 GB",
    description: "Balanced performance and quality",
  },
  {
    id: "phi-3-mini-4k-instruct",
    name: "Phi-3 Mini 4K",
    size: "2.4 GB",
    description: "Microsoft model, good for reasoning",
  },
];

interface ModelSectionProps {
  loadedModel: string | null;
  loadedModelInfo: ModelInfo | null;
  downloadedModels: string[];
  isEmbeddingLoaded: boolean;
  searchApiEmbeddingStatus: SearchApiEmbeddingModelStatus | null;
  kbFolder: string | null;
  memoryKernelPreflight: MemoryKernelPreflightStatus | null;
  memoryKernelLoading: boolean;
  allowUnverifiedLocalModels: boolean;
  loading: string | null;
  isDownloading: boolean;
  downloadProgress: DownloadProgress | null;
  onLoadModel: (modelId: string) => void;
  onUnloadModel: () => void;
  onDownloadModel: (modelId: string) => void;
  onCancelDownload: () => void;
  onLoadCustomModel: () => void;
  onAllowUnverifiedLocalModelsChange: (enabled: boolean) => void;
  onRefreshMemoryKernel: () => void;
}

export function ModelSection({
  loadedModel,
  loadedModelInfo,
  downloadedModels,
  isEmbeddingLoaded,
  searchApiEmbeddingStatus,
  kbFolder,
  memoryKernelPreflight,
  memoryKernelLoading,
  allowUnverifiedLocalModels,
  loading,
  isDownloading,
  downloadProgress,
  onLoadModel,
  onUnloadModel,
  onDownloadModel,
  onCancelDownload,
  onLoadCustomModel,
  onAllowUnverifiedLocalModelsChange,
  onRefreshMemoryKernel,
}: ModelSectionProps) {
  const [showOtherModels, setShowOtherModels] = useState(false);

  const renderModelCard = (model: ModelInfo) => {
    const isDownloaded = downloadedModels.includes(model.id);
    const isLoaded = loadedModel === model.id;
    const isLoadingThis = loading === model.id;
    const isDownloadingThis =
      isDownloading && downloadProgress?.model_id === model.id;

    return (
      <div key={model.id} className={`model-card ${isLoaded ? "loaded" : ""}`}>
        <div className="model-info">
          <h3>{model.name}</h3>
          <p>{model.description}</p>
          <span className="model-size">{model.size}</span>
        </div>
        <div className="model-actions">
          {isDownloadingThis ? (
            <div className="download-progress-container">
              <div className="download-progress">
                <div
                  className="download-bar"
                  style={{
                    width: `${downloadProgress?.percent || 0}%`,
                  }}
                />
                <span className="download-percent">
                  {Math.round(downloadProgress?.percent || 0)}%
                </span>
              </div>
              <div className="download-info">
                <span className="download-size">
                  {formatBytes(downloadProgress?.downloaded_bytes || 0)}
                  {downloadProgress?.total_bytes
                    ? ` / ${formatBytes(downloadProgress.total_bytes)}`
                    : ""}
                </span>
                <span className="download-speed">
                  {formatSpeed(downloadProgress?.speed_bps || 0)}
                </span>
              </div>
              <Button
                variant="ghost"
                size="small"
                onClick={onCancelDownload}
                className="download-cancel-btn"
              >
                Cancel
              </Button>
            </div>
          ) : isDownloaded ? (
            <Button
              variant={isLoaded ? "secondary" : "primary"}
              size="small"
              onClick={() =>
                isLoaded ? onUnloadModel() : onLoadModel(model.id)
              }
              disabled={!!loading}
            >
              {isLoadingThis ? "Loading..." : isLoaded ? "Unload" : "Load"}
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="small"
              onClick={() => onDownloadModel(model.id)}
              disabled={isDownloading}
            >
              Download
            </Button>
          )}
        </div>
      </div>
    );
  };

  return (
    <section className="settings-section">
      <h2>Language Model</h2>
      <p className="settings-description">
        Select and load a language model for generating responses.
      </p>

      {loadedModel && (
        <div className="loaded-model-banner">
          <span>
            Currently loaded: <strong>{loadedModel}</strong>
            {loadedModelInfo?.verification_status && (
              <strong
                className={`verification-badge ${loadedModelInfo.verification_status}`}
              >
                {formatVerificationStatus(loadedModelInfo.verification_status)}
              </strong>
            )}
          </span>
          <Button
            variant="secondary"
            size="small"
            onClick={onUnloadModel}
            disabled={loading === "unload"}
          >
            {loading === "unload" ? "Unloading..." : "Unload"}
          </Button>
        </div>
      )}

      <div className="settings-subsection">
        <h3>Recommended</h3>
        <p className="setting-note">
          For consistent results across operators, AssistSupport recommends a
          single default model.
        </p>
      </div>
      <div className="model-list">
        {RECOMMENDED_MODELS.map(renderModelCard)}
      </div>

      <div className="settings-subsection">
        <Button
          variant="ghost"
          size="small"
          onClick={() => setShowOtherModels((v) => !v)}
          className="btn-hover-scale"
        >
          {showOtherModels
            ? "Hide other supported models"
            : "Show other supported models"}
        </Button>
        {showOtherModels && (
          <>
            <p className="setting-note">
              These models are supported for experimentation, but may be less
              reliable for production ticket responses.
            </p>
            <div className="model-list">
              {OTHER_SUPPORTED_MODELS.map(renderModelCard)}
            </div>
          </>
        )}
      </div>

      <div className="custom-model-section">
        <h3>Custom Model</h3>
        <p className="settings-description">
          Load a GGUF-format model from your computer. Verified models load
          normally. Unverified files are blocked unless you enable the advanced
          override below.
        </p>
        <label className="toggle-label advanced-model-toggle">
          <input
            type="checkbox"
            checked={allowUnverifiedLocalModels}
            onChange={(event) => {
              onAllowUnverifiedLocalModelsChange(event.target.checked);
            }}
          />
          <span className="toggle-text">
            Allow unverified local models (advanced)
          </span>
        </label>
        <p className="setting-note advanced-model-note">
          Keep this off unless you trust the GGUF file source. If you turn it
          on, AssistSupport still warns and asks for confirmation before loading
          an unverified file.
        </p>
        <Button
          variant="secondary"
          onClick={onLoadCustomModel}
          disabled={!!loading || isDownloading}
        >
          {loading === "custom" ? "Loading..." : "Select GGUF File..."}
        </Button>
      </div>

      <div className="custom-model-section">
        <h3>AI Status &amp; Guarantees</h3>
        <p className="settings-description">
          AssistSupport runs AI locally and can operate fully offline. These
          signals help operators trust what the AI is doing.
        </p>
        <div className="settings-grid">
          <div className="settings-card">
            <h4>Local Guarantees</h4>
            <ul className="settings-list">
              <li>
                <strong>Offline-first:</strong> no cloud AI calls
              </li>
              <li>
                <strong>Copy gating:</strong> citations required (override logs
                locally)
              </li>
              <li>
                <strong>Prompts hidden:</strong> operators cannot edit system
                prompts
              </li>
            </ul>
          </div>
          <div className="settings-card">
            <h4>Runtime Status</h4>
            <ul className="settings-list">
              <li>
                <strong>Chat model:</strong>{" "}
                {loadedModel ? loadedModel : "Not loaded"}
              </li>
              <li>
                <strong>Embeddings:</strong>{" "}
                {isEmbeddingLoaded ? "Loaded" : "Not loaded"}
              </li>
              <li>
                <strong>Search API embedding:</strong>{" "}
                {searchApiEmbeddingStatus?.ready
                  ? "Ready"
                  : searchApiEmbeddingStatus?.installed
                    ? "Installed but not ready"
                    : "Not installed"}
              </li>
              <li>
                <strong>KB folder:</strong> {kbFolder ? kbFolder : "Not set"}
              </li>
              <li>
                <strong>MemoryKernel:</strong>{" "}
                {memoryKernelPreflight
                  ? memoryKernelPreflight.status
                  : "Unavailable"}
                {memoryKernelPreflight?.service_contract_version
                  ? ` (svc ${memoryKernelPreflight.service_contract_version})`
                  : ""}
              </li>
            </ul>
            <div className="settings-actions-row">
              <Button
                variant="ghost"
                size="small"
                onClick={onRefreshMemoryKernel}
                disabled={memoryKernelLoading}
              >
                {memoryKernelLoading ? "Refreshing..." : "Refresh"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
