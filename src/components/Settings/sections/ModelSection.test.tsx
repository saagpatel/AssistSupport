// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ModelSection } from "./ModelSection";

function renderSection(
  overrides: Partial<Parameters<typeof ModelSection>[0]> = {},
) {
  const defaults = {
    loadedModel: null as string | null,
    loadedModelInfo: null,
    downloadedModels: [] as string[],
    isEmbeddingLoaded: false,
    searchApiEmbeddingStatus: null,
    kbFolder: null as string | null,
    memoryKernelPreflight: null,
    memoryKernelLoading: false,
    allowUnverifiedLocalModels: false,
    loading: null as string | null,
    isDownloading: false,
    downloadProgress: null,
    onLoadModel: vi.fn(),
    onUnloadModel: vi.fn(),
    onDownloadModel: vi.fn(),
    onCancelDownload: vi.fn(),
    onLoadCustomModel: vi.fn(),
    onAllowUnverifiedLocalModelsChange: vi.fn(),
    onRefreshMemoryKernel: vi.fn(),
  };
  const props = { ...defaults, ...overrides };
  return { props, ...render(<ModelSection {...props} />) };
}

describe("ModelSection", () => {
  afterEach(() => cleanup());

  it("shows the Download button for an undownloaded recommended model", async () => {
    const user = userEvent.setup();
    const { props } = renderSection();
    const downloadButton = screen.getAllByRole("button", {
      name: "Download",
    })[0];
    await user.click(downloadButton);
    expect(props.onDownloadModel).toHaveBeenCalledWith("llama-3.1-8b-instruct");
  });

  it("toggles the Other Supported Models list", async () => {
    const user = userEvent.setup();
    renderSection();
    await user.click(
      screen.getByRole("button", { name: "Show other supported models" }),
    );
    expect(screen.getByText("Llama 3.2 1B Instruct")).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Hide other supported models" }),
    );
  });

  it("triggers onAllowUnverifiedLocalModelsChange when the toggle flips", async () => {
    const user = userEvent.setup();
    const { props } = renderSection();
    await user.click(
      screen.getByLabelText("Allow unverified local models (advanced)"),
    );
    expect(props.onAllowUnverifiedLocalModelsChange).toHaveBeenCalledWith(true);
  });
});
