import { useCallback, useEffect, useMemo, useState } from "react";
import type { SavedDraft } from "../../../types/workspace";
import type { TriageClusterRecord } from "../../../types/queue";
import {
  buildQueueHandoffSnapshot,
  buildQueueItems,
  filterQueueItems,
  loadQueueHandoffSnapshot,
  loadQueueMeta,
  persistQueueHandoffSnapshot,
  persistQueueMeta,
  summarizeQueue,
  type QueueItem,
  type QueueMetaMap,
  type QueuePriority,
  type QueueState,
  type QueueView,
} from "../../inbox/queueModel";
import {
  buildQueueCoachingSnapshot,
  buildQueueHandoffPackText,
  matchesQueueFocusFilter,
  type QueueFocusFilter,
} from "../../inbox/queueCommandCenterHelpers";
import { QUEUE_VIEW_STORAGE_KEY, loadPreferredQueueView } from "./queueHelpers";
import type { QueueHistoryTemplatesSection } from "./QueueHistoryTemplatesPanel";

export type QueueSection = "triage" | QueueHistoryTemplatesSection;

interface UseQueueRenderingStateArgs {
  drafts: SavedDraft[];
  initialQueueView?: QueueView | null;
  onQueueViewConsumed?: () => void;
  listRecentTriageClusters: (limit?: number) => Promise<TriageClusterRecord[]>;
  operatorName: string;
  logEvent: (
    eventName: string,
    properties?: Record<string, unknown>,
  ) => Promise<unknown> | unknown;
  showSuccess: (msg: string) => void;
  showError: (msg: string) => void;
}

export interface UseQueueRenderingStateResult {
  queueMetaMap: QueueMetaMap;
  queueView: QueueView;
  setQueueView: React.Dispatch<React.SetStateAction<QueueView>>;
  queueSection: QueueSection;
  setQueueSection: React.Dispatch<React.SetStateAction<QueueSection>>;
  queueFocusFilter: QueueFocusFilter;
  setQueueFocusFilter: React.Dispatch<React.SetStateAction<QueueFocusFilter>>;
  searchQuery: string;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  selectedIndex: number;
  setSelectedIndex: React.Dispatch<React.SetStateAction<number>>;
  triageHistory: TriageClusterRecord[];
  setTriageHistory: React.Dispatch<React.SetStateAction<TriageClusterRecord[]>>;
  queueItems: QueueItem[];
  queueSummary: ReturnType<typeof summarizeQueue>;
  queueCoaching: ReturnType<typeof buildQueueCoachingSnapshot>;
  queueHandoffSnapshot: ReturnType<typeof buildQueueHandoffSnapshot>;
  queueHandoffPackText: string;
  filteredItems: QueueItem[];
  handoffStatus: string | null;
  updateQueueMeta: (
    draftId: string,
    updates: Partial<{
      owner: string;
      state: QueueState;
      priority: QueuePriority;
    }>,
  ) => void;
  handleCopyHandoffPack: () => Promise<void>;
}

export function useQueueRenderingState({
  drafts,
  initialQueueView,
  onQueueViewConsumed,
  listRecentTriageClusters,
  operatorName,
  logEvent,
  showSuccess,
  showError,
}: UseQueueRenderingStateArgs): UseQueueRenderingStateResult {
  const [queueMetaMap, setQueueMetaMap] = useState<QueueMetaMap>(() =>
    loadQueueMeta(),
  );
  const [previousHandoffSnapshot, setPreviousHandoffSnapshot] = useState(() =>
    loadQueueHandoffSnapshot(),
  );
  const [queueView, setQueueView] = useState<QueueView>(loadPreferredQueueView);
  const [queueSection, setQueueSection] = useState<QueueSection>("triage");
  const [queueFocusFilter, setQueueFocusFilter] =
    useState<QueueFocusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [triageHistory, setTriageHistory] = useState<TriageClusterRecord[]>([]);
  const [handoffStatus, setHandoffStatus] = useState<string | null>(null);

  useEffect(() => {
    listRecentTriageClusters(20)
      .then(setTriageHistory)
      .catch(() => setTriageHistory([]));
  }, [listRecentTriageClusters]);

  useEffect(() => {
    if (!initialQueueView) return;
    setQueueSection("triage");
    setQueueView(initialQueueView);
    onQueueViewConsumed?.();
  }, [initialQueueView, onQueueViewConsumed]);

  useEffect(() => {
    try {
      localStorage.setItem(QUEUE_VIEW_STORAGE_KEY, queueView);
    } catch {
      // Keep queue workflows usable even if storage is restricted.
    }
  }, [queueView]);

  const queueItems = useMemo(
    () => buildQueueItems(drafts, queueMetaMap),
    [drafts, queueMetaMap],
  );
  const queueSummary = useMemo(() => summarizeQueue(queueItems), [queueItems]);
  const queueCoaching = useMemo(
    () => buildQueueCoachingSnapshot(queueItems, triageHistory),
    [queueItems, triageHistory],
  );
  const queueHandoffSnapshot = useMemo(
    () => buildQueueHandoffSnapshot(queueItems),
    [queueItems],
  );
  const queueHandoffPackText = useMemo(
    () =>
      buildQueueHandoffPackText(queueHandoffSnapshot, previousHandoffSnapshot),
    [queueHandoffSnapshot, previousHandoffSnapshot],
  );

  const filteredItems = useMemo(() => {
    const scoped = filterQueueItems(queueItems, queueView);
    const focused = scoped.filter((item) =>
      matchesQueueFocusFilter(item, queueFocusFilter, triageHistory),
    );
    const q = searchQuery.trim().toLowerCase();
    if (!q) return focused;
    return focused.filter((item) => {
      const ticket = item.draft.ticket_id?.toLowerCase() ?? "";
      const summary = item.draft.summary_text?.toLowerCase() ?? "";
      const input = item.draft.input_text.toLowerCase();
      return ticket.includes(q) || summary.includes(q) || input.includes(q);
    });
  }, [queueItems, queueView, queueFocusFilter, triageHistory, searchQuery]);

  useEffect(() => {
    setSelectedIndex((prev) => {
      if (filteredItems.length === 0) return 0;
      return Math.max(0, Math.min(prev, filteredItems.length - 1));
    });
  }, [filteredItems]);

  const updateQueueMeta = useCallback(
    (
      draftId: string,
      updates: Partial<{
        owner: string;
        state: QueueState;
        priority: QueuePriority;
      }>,
    ) => {
      setQueueMetaMap((prev) => {
        const existing = prev[draftId] ?? {
          owner: "unassigned",
          state: "open" as QueueState,
          priority: "normal" as QueuePriority,
          updatedAt: new Date().toISOString(),
        };

        const next: QueueMetaMap = {
          ...prev,
          [draftId]: {
            ...existing,
            ...updates,
            updatedAt: new Date().toISOString(),
          },
        };

        persistQueueMeta(next);
        return next;
      });
    },
    [],
  );

  const handleCopyHandoffPack = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      setHandoffStatus("Clipboard not available in this environment.");
      return;
    }

    try {
      await navigator.clipboard.writeText(queueHandoffPackText);
      persistQueueHandoffSnapshot(queueHandoffSnapshot);
      setPreviousHandoffSnapshot(queueHandoffSnapshot);
      setHandoffStatus("Shift handoff pack copied.");
      void logEvent("queue_handoff_pack_copied", {
        operator: operatorName,
        queue_view: queueView,
        at_risk: queueHandoffSnapshot.summary.atRisk,
      });
      showSuccess("Shift handoff pack copied");
    } catch {
      setHandoffStatus("Failed to copy shift handoff pack.");
      showError("Failed to copy shift handoff pack");
    }
  }, [
    queueHandoffPackText,
    queueHandoffSnapshot,
    logEvent,
    operatorName,
    queueView,
    showSuccess,
    showError,
  ]);

  return {
    queueMetaMap,
    queueView,
    setQueueView,
    queueSection,
    setQueueSection,
    queueFocusFilter,
    setQueueFocusFilter,
    searchQuery,
    setSearchQuery,
    selectedIndex,
    setSelectedIndex,
    triageHistory,
    setTriageHistory,
    queueItems,
    queueSummary,
    queueCoaching,
    queueHandoffSnapshot,
    queueHandoffPackText,
    filteredItems,
    handoffStatus,
    updateQueueMeta,
    handleCopyHandoffPack,
  };
}
