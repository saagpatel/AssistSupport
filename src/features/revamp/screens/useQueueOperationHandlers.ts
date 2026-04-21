import { useCallback } from "react";
import type { SavedDraft } from "../../../types/workspace";
import {
  type QueueItem,
  type QueuePriority,
  type QueueState,
} from "../../inbox/queueModel";

interface UseQueueOperationHandlersArgs {
  filteredItems: QueueItem[];
  selectedIndex: number;
  setSelectedIndex: React.Dispatch<React.SetStateAction<number>>;
  updateQueueMeta: (
    draftId: string,
    updates: Partial<{
      owner: string;
      state: QueueState;
      priority: QueuePriority;
    }>,
  ) => void;
  operatorName: string;
  onLoadDraft: (draft: SavedDraft) => void;
  logEvent: (
    eventName: string,
    properties?: Record<string, unknown>,
  ) => Promise<unknown> | unknown;
}

export interface UseQueueOperationHandlersResult {
  currentItem: QueueItem | null;
  handleClaim: (draftId: string) => void;
  handleResolve: (draftId: string) => void;
  handleReopen: (draftId: string) => void;
  handlePriorityChange: (draftId: string, priority: QueuePriority) => void;
  handleQueueKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void;
}

export function useQueueOperationHandlers({
  filteredItems,
  selectedIndex,
  setSelectedIndex,
  updateQueueMeta,
  operatorName,
  onLoadDraft,
  logEvent,
}: UseQueueOperationHandlersArgs): UseQueueOperationHandlersResult {
  const currentItem = filteredItems[selectedIndex] ?? null;

  const withCurrentItem = useCallback(
    (handler: (item: QueueItem) => void) => {
      if (!currentItem) return;
      handler(currentItem);
    },
    [currentItem],
  );

  const handleClaim = useCallback(
    (draftId: string) => {
      updateQueueMeta(draftId, { owner: operatorName, state: "in_progress" });
      void logEvent("queue_item_claimed", {
        draft_id: draftId,
        operator: operatorName,
      });
    },
    [logEvent, operatorName, updateQueueMeta],
  );

  const handleResolve = useCallback(
    (draftId: string) => {
      updateQueueMeta(draftId, { state: "resolved" });
      void logEvent("queue_item_resolved", {
        draft_id: draftId,
        operator: operatorName,
      });
    },
    [logEvent, operatorName, updateQueueMeta],
  );

  const handleReopen = useCallback(
    (draftId: string) => {
      updateQueueMeta(draftId, { state: "open" });
      void logEvent("queue_item_reopened", {
        draft_id: draftId,
        operator: operatorName,
      });
    },
    [logEvent, operatorName, updateQueueMeta],
  );

  const handlePriorityChange = useCallback(
    (draftId: string, priority: QueuePriority) => {
      updateQueueMeta(draftId, { priority });
      void logEvent("queue_item_priority_changed", {
        draft_id: draftId,
        operator: operatorName,
        priority,
      });
    },
    [logEvent, operatorName, updateQueueMeta],
  );

  const handleQueueKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      const target = event.target as HTMLElement;
      const isInputElement =
        target.tagName === "INPUT" ||
        target.tagName === "SELECT" ||
        target.tagName === "TEXTAREA";
      if (isInputElement) return;

      switch (event.key.toLowerCase()) {
        case "arrowdown":
        case "j":
          event.preventDefault();
          setSelectedIndex((prev) =>
            Math.min(prev + 1, Math.max(filteredItems.length - 1, 0)),
          );
          break;
        case "arrowup":
        case "k":
          event.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case "enter":
          event.preventDefault();
          withCurrentItem((item) => {
            onLoadDraft(item.draft);
            void logEvent("queue_item_opened", {
              draft_id: item.draft.id,
              operator: operatorName,
              entrypoint: "keyboard",
            });
          });
          break;
        case "c":
          event.preventDefault();
          withCurrentItem((item) => {
            if (
              item.meta.owner === "unassigned" &&
              item.meta.state !== "resolved"
            ) {
              handleClaim(item.draft.id);
            }
          });
          break;
        case "x":
          event.preventDefault();
          withCurrentItem((item) => {
            if (item.meta.state !== "resolved") {
              handleResolve(item.draft.id);
            }
          });
          break;
        case "o":
          event.preventDefault();
          withCurrentItem((item) => {
            if (item.meta.state === "resolved") {
              handleReopen(item.draft.id);
            }
          });
          break;
        default:
          break;
      }
    },
    [
      filteredItems.length,
      handleClaim,
      handleReopen,
      handleResolve,
      logEvent,
      onLoadDraft,
      operatorName,
      setSelectedIndex,
      withCurrentItem,
    ],
  );

  return {
    currentItem,
    handleClaim,
    handleResolve,
    handleReopen,
    handlePriorityChange,
    handleQueueKeyDown,
  };
}
