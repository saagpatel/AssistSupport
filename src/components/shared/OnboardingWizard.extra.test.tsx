// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OnboardingWizard, formatBytes } from "./OnboardingWizard";

const invokeMock = vi.fn();
const openMock = vi.fn();
const downloadModelMock = vi.fn();
const cancelDownloadMock = vi.fn();

let downloadState: {
  isDownloading: boolean;
  downloadProgress: null | {
    percent: number;
    downloaded_bytes: number;
    total_bytes: number;
    speed_bps: number;
  };
  error: string | null;
};

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: (...args: unknown[]) => openMock(...args),
}));

vi.mock("../../hooks/useDownload", () => ({
  useDownload: () => ({
    isDownloading: downloadState.isDownloading,
    downloadProgress: downloadState.downloadProgress,
    error: downloadState.error,
    downloadModel: downloadModelMock,
    cancelDownload: cancelDownloadMock,
  }),
}));

vi.mock("./Dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("./Icon", () => ({
  Icon: ({ name }: { name: string }) => <span>{name}</span>,
}));

beforeEach(() => {
  downloadState = {
    isDownloading: false,
    downloadProgress: null,
    error: null,
  };
  invokeMock.mockResolvedValue(null);
  openMock.mockResolvedValue("/tmp/kb");
  downloadModelMock.mockResolvedValue(undefined);
  cancelDownloadMock.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  invokeMock.mockReset();
  openMock.mockReset();
  downloadModelMock.mockReset();
  cancelDownloadMock.mockReset();
});

describe("OnboardingWizard additional coverage", () => {
  it("walks through model download, kb selection, and completion", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<OnboardingWizard onComplete={onComplete} onSkip={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Get Started" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: /Llama 3.1 8B/i }));
    await waitFor(() =>
      expect(downloadModelMock).toHaveBeenCalledWith("llama-3.1-8b-instruct"),
    );

    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: /Select Folder/i }));
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("set_kb_folder", {
        folderPath: "/tmp/kb",
      }),
    );

    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText(/knowledge base configured/i)).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Start Using AssistSupport" }),
    );
    expect(onComplete).toHaveBeenCalled();
  });

  it("shows download progress and supports cancellation", async () => {
    const user = userEvent.setup();
    downloadState = {
      isDownloading: true,
      downloadProgress: {
        percent: 42,
        downloaded_bytes: 4200,
        total_bytes: 10000,
        speed_bps: 2048,
      },
      error: null,
    };

    render(<OnboardingWizard onComplete={vi.fn()} onSkip={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Get Started" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText(/Downloading... 42%/i)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Cancel Download" }));
    expect(cancelDownloadMock).toHaveBeenCalled();
  });

  it("formats larger byte sizes and surfaces download failures", async () => {
    const user = userEvent.setup();
    expect(formatBytes(2 * 1024 * 1024)).toBe("2.0 MB");
    expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe("3.0 GB");

    downloadModelMock.mockRejectedValueOnce(new Error("download failed"));
    render(<OnboardingWizard onComplete={vi.fn()} onSkip={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Get Started" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: /Llama 3.1 8B/i }));

    await screen.findByText(/download failed/i);
  });
});
