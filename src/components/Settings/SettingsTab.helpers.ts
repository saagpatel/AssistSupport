import type { ResponseQualityThresholds } from "../../features/analytics/qualityThresholds";
import type { SearchApiEmbeddingModelStatus } from "../../types/settings";

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / k ** i).toFixed(1)} ${sizes[i]}`;
}

export function formatSpeed(bps: number): string {
  if (bps === 0) return "";
  return `${formatBytes(bps)}/s`;
}

export function formatVerificationStatus(
  status: string | null | undefined,
): string {
  if (status === "verified") return "Verified";
  if (status === "unverified") return "Unverified";
  return "Unknown";
}

export function getSearchApiEmbeddingBadge(
  status: SearchApiEmbeddingModelStatus | null,
  installError: string | null,
): { label: string; className: string; detail: string } {
  if (installError) {
    return {
      label: "Unavailable",
      className: "error",
      detail: installError,
    };
  }

  if (!status) {
    return {
      label: "Checking",
      className: "downloaded",
      detail:
        "Checking whether the managed search API embedding model is installed.",
    };
  }

  if (!status.installed) {
    return {
      label: "Not Installed",
      className: "not-downloaded",
      detail:
        "Install this managed model to keep search-api embeddings explicit, pinned, and offline at runtime.",
    };
  }

  if (!status.ready) {
    return {
      label: "Needs Repair",
      className: "error",
      detail:
        status.error ??
        "The managed search API embedding model is installed but not ready.",
    };
  }

  return {
    label: "Ready",
    className: "loaded",
    detail: `Pinned revision ${status.revision}. Loaded from local disk only at runtime.`,
  };
}

export function validateQualityThresholds(
  thresholds: ResponseQualityThresholds,
): string | null {
  if (thresholds.editRatioWatch >= thresholds.editRatioAction) {
    return "Edit ratio watch threshold must be lower than action threshold.";
  }
  if (thresholds.timeToDraftWatchMs >= thresholds.timeToDraftActionMs) {
    return "Time-to-draft watch threshold must be lower than action threshold.";
  }
  if (thresholds.copyPerSaveWatch <= thresholds.copyPerSaveAction) {
    return "Copy-per-save watch threshold must be higher than action threshold.";
  }
  if (thresholds.editedSaveRateWatch >= thresholds.editedSaveRateAction) {
    return "Edited save rate watch threshold must be lower than action threshold.";
  }
  return null;
}

export function formatAuditEvent(
  event: string | Record<string, string>,
): string {
  if (typeof event === "string") return event;
  if (typeof event === "object" && event !== null) {
    const key = Object.keys(event)[0];
    return key ? `${key}: ${event[key]}` : JSON.stringify(event);
  }
  return String(event);
}
