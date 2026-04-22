import { useCallback, useEffect, useRef, useState } from "react";
import type { ConfidenceAssessment } from "../../types/llm";
import type { ParsedResponse } from "./responsePanelHelpers";
import { auditResponseCopyOverride, exportDraft } from "./draftTauriCommands";

export type ExportFormat = "Markdown" | "PlainText" | "Html";

interface UseResponsePanelCopyArgs {
  response: string;
  parsed: ParsedResponse;
  confidenceMode: ConfidenceAssessment["mode"] | undefined;
  sourcesCount: number;
  onShowSuccess: (msg: string) => void;
  onShowError: (msg: string) => void;
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
  onShowSuccess,
  onShowError,
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
        const saved = await exportDraft({
          responseText: response,
          format,
        });
        if (saved) {
          onShowSuccess("Response exported successfully");
        }
      } catch (err) {
        onShowError(`Export failed: ${err}`);
      }
      setShowExportMenu(false);
    },
    [response, onShowSuccess, onShowError],
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
      onShowError(`Copy failed: ${err}`);
    }
  }, [response, parsed, confidenceMode, sourcesCount, onShowError]);

  const handleConfirmCopyOverride = useCallback(async () => {
    if (!response) return;
    const reason = copyOverrideReason.trim();
    if (!reason) {
      onShowError("Reason is required to override copy gating.");
      return;
    }

    try {
      setCopyOverrideSubmitting(true);
      await auditResponseCopyOverride({
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
      onShowSuccess("Response copied (override logged)");
    } catch (err) {
      onShowError(`Copy override failed: ${err}`);
    } finally {
      setCopyOverrideSubmitting(false);
    }
  }, [
    response,
    parsed,
    copyOverrideReason,
    confidenceMode,
    sourcesCount,
    onShowError,
    onShowSuccess,
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
