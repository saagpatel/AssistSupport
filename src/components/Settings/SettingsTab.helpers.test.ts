import { describe, expect, it } from "vitest";
import {
  formatBytes,
  formatSpeed,
  formatVerificationStatus,
  getSearchApiEmbeddingBadge,
  validateQualityThresholds,
} from "./SettingsTab";

describe("SettingsTab helpers", () => {
  it("formats bytes and speeds across edge cases", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512.0 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(2 * 1024 * 1024)).toBe("2.0 MB");
    expect(formatSpeed(0)).toBe("");
    expect(formatSpeed(2048)).toBe("2.0 KB/s");
  });

  it("formats model verification states", () => {
    expect(formatVerificationStatus("verified")).toBe("Verified");
    expect(formatVerificationStatus("unverified")).toBe("Unverified");
    expect(formatVerificationStatus(null)).toBe("Unknown");
  });

  it("returns the correct search-api badge state for each branch", () => {
    expect(getSearchApiEmbeddingBadge(null, "offline")).toEqual({
      label: "Unavailable",
      className: "error",
      detail: "offline",
    });

    expect(getSearchApiEmbeddingBadge(null, null)).toEqual({
      label: "Checking",
      className: "downloaded",
      detail:
        "Checking whether the managed search API embedding model is installed.",
    });

    expect(
      getSearchApiEmbeddingBadge(
        {
          installed: false,
          ready: false,
          model_name: "model",
          revision: "rev",
          local_path: null,
          error: null,
        },
        null,
      ),
    ).toEqual({
      label: "Not Installed",
      className: "not-downloaded",
      detail:
        "Install this managed model to keep search-api embeddings explicit, pinned, and offline at runtime.",
    });

    expect(
      getSearchApiEmbeddingBadge(
        {
          installed: true,
          ready: false,
          model_name: "model",
          revision: "rev",
          local_path: null,
          error: "repair needed",
        },
        null,
      ),
    ).toEqual({
      label: "Needs Repair",
      className: "error",
      detail: "repair needed",
    });

    expect(
      getSearchApiEmbeddingBadge(
        {
          installed: true,
          ready: true,
          model_name: "model",
          revision: "rev-1",
          local_path: "/tmp/model",
          error: null,
        },
        null,
      ),
    ).toEqual({
      label: "Ready",
      className: "loaded",
      detail: "Pinned revision rev-1. Loaded from local disk only at runtime.",
    });
  });

  it("validates each response-quality threshold branch", () => {
    expect(
      validateQualityThresholds({
        editRatioWatch: 0.4,
        editRatioAction: 0.4,
        timeToDraftWatchMs: 1000,
        timeToDraftActionMs: 2000,
        copyPerSaveWatch: 3,
        copyPerSaveAction: 2,
        editedSaveRateWatch: 0.2,
        editedSaveRateAction: 0.4,
      }),
    ).toContain("Edit ratio watch");

    expect(
      validateQualityThresholds({
        editRatioWatch: 0.2,
        editRatioAction: 0.4,
        timeToDraftWatchMs: 2000,
        timeToDraftActionMs: 2000,
        copyPerSaveWatch: 3,
        copyPerSaveAction: 2,
        editedSaveRateWatch: 0.2,
        editedSaveRateAction: 0.4,
      }),
    ).toContain("Time-to-draft");

    expect(
      validateQualityThresholds({
        editRatioWatch: 0.2,
        editRatioAction: 0.4,
        timeToDraftWatchMs: 1000,
        timeToDraftActionMs: 2000,
        copyPerSaveWatch: 2,
        copyPerSaveAction: 2,
        editedSaveRateWatch: 0.2,
        editedSaveRateAction: 0.4,
      }),
    ).toContain("Copy-per-save");

    expect(
      validateQualityThresholds({
        editRatioWatch: 0.2,
        editRatioAction: 0.4,
        timeToDraftWatchMs: 1000,
        timeToDraftActionMs: 2000,
        copyPerSaveWatch: 3,
        copyPerSaveAction: 2,
        editedSaveRateWatch: 0.4,
        editedSaveRateAction: 0.4,
      }),
    ).toContain("Edited save rate");

    expect(
      validateQualityThresholds({
        editRatioWatch: 0.2,
        editRatioAction: 0.4,
        timeToDraftWatchMs: 1000,
        timeToDraftActionMs: 2000,
        copyPerSaveWatch: 3,
        copyPerSaveAction: 2,
        editedSaveRateWatch: 0.2,
        editedSaveRateAction: 0.4,
      }),
    ).toBeNull();
  });
});
