// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SemanticSearchSection } from "./SemanticSearchSection";

function renderSection(
  overrides: Partial<Parameters<typeof SemanticSearchSection>[0]> = {},
) {
  const defaults = {
    embeddingDownloaded: false,
    isEmbeddingLoaded: false,
    embeddingLoading: false,
    embeddingModelInfo: null,
    vectorEnabled: false,
    generatingEmbeddings: false,
    isDownloading: false,
    downloadProgress: null,
    searchApiEmbeddingStatus: {
      installed: false,
      ready: false,
      model_name: "sentence-transformers/all-MiniLM-L6-v2",
      revision: "pinned",
      local_path: null,
      error: null,
    },
    searchApiEmbeddingLoading: false,
    searchApiEmbeddingBadge: {
      label: "Not Installed",
      className: "not-downloaded",
      detail: "Install this managed model...",
    },
    onCancelDownload: vi.fn(),
    onDownloadEmbeddingModel: vi.fn(),
    onLoadEmbeddingModel: vi.fn(),
    onUnloadEmbeddingModel: vi.fn(),
    onGenerateEmbeddings: vi.fn(),
    onInstallSearchApiEmbeddingModel: vi.fn(),
    onRefreshSearchApiEmbeddingStatus: vi.fn(),
  };
  const props = { ...defaults, ...overrides };
  return { props, ...render(<SemanticSearchSection {...props} />) };
}

describe("SemanticSearchSection", () => {
  afterEach(() => cleanup());

  it("prompts to download the desktop model when not downloaded", async () => {
    const user = userEvent.setup();
    const { props } = renderSection();
    await user.click(screen.getByRole("button", { name: "Download Model" }));
    expect(props.onDownloadEmbeddingModel).toHaveBeenCalledTimes(1);
  });

  it("renders the Unload control when loaded and triggers onUnloadEmbeddingModel", async () => {
    const user = userEvent.setup();
    const { props } = renderSection({
      embeddingDownloaded: true,
      isEmbeddingLoaded: true,
      embeddingModelInfo: { name: "nomic-embed-text", embedding_dim: 768 },
    });
    await user.click(screen.getByRole("button", { name: "Unload" }));
    expect(props.onUnloadEmbeddingModel).toHaveBeenCalledTimes(1);
  });

  it("invokes search API install and refresh callbacks", async () => {
    const user = userEvent.setup();
    const { props } = renderSection();
    await user.click(screen.getByRole("button", { name: "Install Model" }));
    expect(props.onInstallSearchApiEmbeddingModel).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Refresh Status" }));
    expect(props.onRefreshSearchApiEmbeddingStatus).toHaveBeenCalledTimes(1);
  });
});
