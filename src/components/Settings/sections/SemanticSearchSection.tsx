import type { DownloadProgress } from "../../../types/llm";
import type { SearchApiEmbeddingModelStatus } from "../../../types/settings";
import { Button } from "../../shared/Button";
import { formatBytes, formatSpeed } from "../SettingsTab.helpers";

interface SemanticSearchSectionProps {
  embeddingDownloaded: boolean;
  isEmbeddingLoaded: boolean;
  embeddingLoading: boolean;
  embeddingModelInfo: { name?: string; embedding_dim?: number } | null;
  vectorEnabled: boolean;
  generatingEmbeddings: boolean;
  isDownloading: boolean;
  downloadProgress: DownloadProgress | null;
  searchApiEmbeddingStatus: SearchApiEmbeddingModelStatus | null;
  searchApiEmbeddingLoading: boolean;
  searchApiEmbeddingBadge: { label: string; className: string; detail: string };
  onCancelDownload: () => void;
  onDownloadEmbeddingModel: () => void;
  onLoadEmbeddingModel: () => void;
  onUnloadEmbeddingModel: () => void;
  onGenerateEmbeddings: () => void;
  onInstallSearchApiEmbeddingModel: () => void;
  onRefreshSearchApiEmbeddingStatus: () => void;
}

export function SemanticSearchSection({
  embeddingDownloaded,
  isEmbeddingLoaded,
  embeddingLoading,
  embeddingModelInfo,
  vectorEnabled,
  generatingEmbeddings,
  isDownloading,
  downloadProgress,
  searchApiEmbeddingStatus,
  searchApiEmbeddingLoading,
  searchApiEmbeddingBadge,
  onCancelDownload,
  onDownloadEmbeddingModel,
  onLoadEmbeddingModel,
  onUnloadEmbeddingModel,
  onGenerateEmbeddings,
  onInstallSearchApiEmbeddingModel,
  onRefreshSearchApiEmbeddingStatus,
}: SemanticSearchSectionProps) {
  return (
    <section className="settings-section">
      <h2>Semantic Search Models</h2>
      <p className="settings-description">
        AssistSupport uses two separate local models for semantic search: one
        for the desktop knowledge base and one for the Python search API. Both
        are managed explicitly here and kept offline at runtime.
      </p>

      <div className="settings-grid semantic-model-grid">
        <div className="settings-card semantic-model-card">
          <h3>Desktop Embedding Model</h3>
          <p className="settings-description">
            Used for local knowledge-base embeddings and vector search. Uses{" "}
            <code>nomic-embed-text</code> (768 dimensions, about 550 MB).
          </p>
          <div className="embedding-model-config">
            {isDownloading &&
            downloadProgress?.model_id === "nomic-embed-text" ? (
              <div className="download-progress-container">
                <div className="download-progress">
                  <div
                    className="download-bar"
                    style={{ width: `${downloadProgress?.percent || 0}%` }}
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
            ) : !embeddingDownloaded ? (
              <div className="embedding-status">
                <span className="status-badge not-downloaded">
                  Not Downloaded
                </span>
                <Button
                  variant="primary"
                  size="small"
                  onClick={onDownloadEmbeddingModel}
                  disabled={isDownloading}
                >
                  Download Model
                </Button>
              </div>
            ) : !isEmbeddingLoaded ? (
              <div className="embedding-status">
                <span className="status-badge downloaded">Downloaded</span>
                <Button
                  variant="primary"
                  size="small"
                  onClick={onLoadEmbeddingModel}
                  disabled={embeddingLoading}
                >
                  {embeddingLoading ? "Loading..." : "Load Model"}
                </Button>
              </div>
            ) : (
              <div className="embedding-status">
                <span className="status-badge loaded">Loaded</span>
                <div className="embedding-info">
                  <span className="model-name">
                    {embeddingModelInfo?.name || "nomic-embed-text"}
                  </span>
                  <span className="model-dim">
                    {embeddingModelInfo?.embedding_dim || 768} dimensions
                  </span>
                </div>
                <Button
                  variant="secondary"
                  size="small"
                  onClick={onUnloadEmbeddingModel}
                >
                  Unload
                </Button>
              </div>
            )}

            {vectorEnabled && isEmbeddingLoaded && (
              <div className="generate-embeddings-row">
                <Button
                  variant="ghost"
                  size="small"
                  onClick={onGenerateEmbeddings}
                  disabled={generatingEmbeddings}
                >
                  {generatingEmbeddings
                    ? "Generating..."
                    : "Generate Embeddings for KB"}
                </Button>
                <p className="setting-note">
                  Creates vector embeddings for all indexed documents.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="settings-card semantic-model-card">
          <h3>Search API Embedding Model</h3>
          <p className="settings-description">
            Used by the local Python hybrid search API. This managed install is
            pinned to a specific Hugging Face revision and loaded from local
            disk only.
          </p>
          <div className="embedding-status">
            <span
              className={`status-badge ${searchApiEmbeddingBadge.className}`}
            >
              {searchApiEmbeddingBadge.label}
            </span>
            <div className="embedding-info">
              <span className="model-name">
                {searchApiEmbeddingStatus?.model_name ??
                  "sentence-transformers/all-MiniLM-L6-v2"}
              </span>
              <span className="model-dim">
                {searchApiEmbeddingStatus?.local_path
                  ? "Managed local install"
                  : "No managed install detected"}
              </span>
            </div>
            <Button
              variant={
                searchApiEmbeddingStatus?.ready ? "secondary" : "primary"
              }
              size="small"
              onClick={onInstallSearchApiEmbeddingModel}
              disabled={searchApiEmbeddingLoading}
            >
              {searchApiEmbeddingLoading
                ? "Installing..."
                : searchApiEmbeddingStatus?.ready
                  ? "Reinstall"
                  : "Install Model"}
            </Button>
          </div>
          <p className="setting-note semantic-model-note">
            {searchApiEmbeddingBadge.detail}
          </p>
          <div className="settings-actions-row">
            <Button
              variant="ghost"
              size="small"
              onClick={onRefreshSearchApiEmbeddingStatus}
              disabled={searchApiEmbeddingLoading}
            >
              Refresh Status
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
