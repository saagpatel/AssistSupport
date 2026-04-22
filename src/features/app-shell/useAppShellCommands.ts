import { useMemo } from "react";
import { buildAppShellCommands } from "./commands";
import type { TabId } from "./types";
import type { QueueView } from "../inbox/queueModel";
import type { RevampFlags } from "../revamp";

interface UseAppShellCommandsParams {
  activeTab: TabId;
  revampCommandPaletteV2Enabled: boolean;
  revampFlags: RevampFlags;
  setActiveTab: (tab: TabId) => void;
  openQueueView: (queueView: QueueView) => void;
  handleGenerate: () => void;
  handleSaveDraft: () => void;
  handleCopyResponse: () => void;
  handleExport: () => void;
  handleCancelGeneration: () => void;
  onOpenShortcuts: () => void;
  clearDraft: () => void;
}

export function useAppShellCommands({
  activeTab,
  revampCommandPaletteV2Enabled,
  revampFlags,
  setActiveTab,
  openQueueView,
  handleGenerate,
  handleSaveDraft,
  handleCopyResponse,
  handleExport,
  handleCancelGeneration,
  onOpenShortcuts,
  clearDraft,
}: UseAppShellCommandsParams) {
  return useMemo(
    () =>
      buildAppShellCommands({
        activeTab,
        revampCommandPaletteV2Enabled,
        revampFlags,
        setActiveTab,
        openQueueView,
        handleGenerate,
        handleSaveDraft,
        handleCopyResponse,
        handleExport,
        handleCancelGeneration,
        onOpenShortcuts,
        clearDraft,
      }),
    [
      activeTab,
      revampCommandPaletteV2Enabled,
      revampFlags,
      setActiveTab,
      openQueueView,
      handleGenerate,
      handleSaveDraft,
      handleCopyResponse,
      handleExport,
      handleCancelGeneration,
      onOpenShortcuts,
      clearDraft,
    ],
  );
}
