import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ConfidenceAssessment } from "../../types/llm";
import type { ParsedResponse } from "./responsePanelHelpers";

export type ExportFormat = "Markdown" | "PlainText" | "Html";

interface UseResponsePanelCopyArgs {
  response: string;
  parsed: ParsedResponse;
  confidenceMode: ConfidenceAssessment["mode"] | undefined;
  sourcesCount: number;
  showSuccess: (msg: string) => void;
  showError: (msg: string) => void;
}

export interface UseResponsePanelCopyResult {
  copied: boolean;
  showCopyOverride: boolean;
  copyOverrideReason: string;
  copyOverrideSubmitting: boolean;
  showExportMenu: boolean;
  exportMenuRef: React.RefObject<HTMLDivElement | null>;
  setShowCopyOverride: (show: boolean) => void;
  setCopyOverrideReason: (reason: string) => void;
  setShowExportMenu: (show: boolean) => void;
  handleCopy: () => Promise<void>;
  handleConfirmCopyOverride: () => Promise<void>;
  handleExport: (format: ExportFormat) => Promise<void>;
  cancelCopyOverride: () => void;
}

export function useResponsePanelCopy({
  response,
  parsed,
  confidenceMode,
  sourcesCount,
  showSuccess,
  showError,
}: UseResponsePanelCopyArgs): UseResponsePanelCopyResult {
  const [copied, setCopied] = useState(false);
  const [showCopyOverride, setShowCopyOverride] = useState(false);
  const [copyOverrideReason, setCopyOverrideReason] = useState("");
  const [copyOverrideSubmitting, setCopyOverrideSubmitting] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showExportMenu) return;
    function handleClickOutside(event: MouseEvent) {
      if (
        exportMenuRef.current &&
        !exportMenuRef.current.contains(event.target as Node)
      ) {
        setShowExportMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showExportMenu]);

  const handleExport = useCallback(
    async (format: ExportFormat) => {
      if (!response) return;
      try {
        const saved = await invoke<boolean>("export_draft", {
          responseText: response,
          format,
        });
        if (saved) {
          showSuccess("Response exported successfully");
        }
      } catch (err) {
        showError(`Export failed: ${err}`);
      }
      setShowExportMenu(false);
    },
    [response, showSuccess, showError],
  );

  const handleCopy = useCallback(async () => {
    if (!response) return;
    const mode = confidenceMode ?? "answer";
    const hasCitations = sourcesCount > 0;
    const copyAllowed = mode === "answer" && hasCitations;

    if (!copyAllowed) {
      setShowCopyOverride(true);
      return;
    }
    try {
      const textToCopy = parsed.hasSections ? parsed.output : response;
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      showError(`Copy failed: ${err}`);
    }
  }, [response, parsed, confidenceMode, sourcesCount, showError]);

  const handleConfirmCopyOverride = useCallback(async () => {
    if (!response) return;
    const reason = copyOverrideReason.trim();
    if (!reason) {
      showError("Reason is required to override copy gating.");
      return;
    }

    try {
      setCopyOverrideSubmitting(true);
      await invoke("audit_response_copy_override", {
        reason,
        confidenceMode: confidenceMode ?? null,
        sourcesCount,
      });

      const textToCopy = parsed.hasSections ? parsed.output : response;
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      setShowCopyOverride(false);
      setCopyOverrideReason("");
      showSuccess("Response copied (override logged)");
    } catch (err) {
      showError(`Copy override failed: ${err}`);
    } finally {
      setCopyOverrideSubmitting(false);
    }
  }, [
    response,
    parsed,
    copyOverrideReason,
    confidenceMode,
    sourcesCount,
    showError,
    showSuccess,
  ]);

  const cancelCopyOverride = useCallback(() => {
    setShowCopyOverride(false);
    setCopyOverrideReason("");
  }, []);

  return {
    copied,
    showCopyOverride,
    copyOverrideReason,
    copyOverrideSubmitting,
    showExportMenu,
    exportMenuRef,
    setShowCopyOverride,
    setCopyOverrideReason,
    setShowExportMenu,
    handleCopy,
    handleConfirmCopyOverride,
    handleExport,
    cancelCopyOverride,
  };
}
