import type { QueueItem, QueueView } from "../../inbox/queueModel";
import type { SavedDraft } from "../../../types/workspace";

export const QUEUE_OPERATOR_STORAGE_KEY = "assistsupport.queue.operator";
export const QUEUE_VIEW_STORAGE_KEY = "assistsupport.queue.favorite-view";

export function formatTicketLabel(draft: SavedDraft): string {
  return draft.ticket_id?.trim() || `Draft ${draft.id.slice(0, 8)}`;
}

export function truncate(value: string, limit: number): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}...`;
}

export function loadOperatorName(): string {
  if (typeof window === "undefined") return "current-operator";
  try {
    return (
      localStorage.getItem(QUEUE_OPERATOR_STORAGE_KEY) || "current-operator"
    );
  } catch {
    return "current-operator";
  }
}

export function loadPreferredQueueView(): QueueView {
  if (typeof window === "undefined") return "all";
  try {
    const stored = localStorage.getItem(QUEUE_VIEW_STORAGE_KEY);
    if (
      stored === "all" ||
      stored === "unassigned" ||
      stored === "at_risk" ||
      stored === "in_progress" ||
      stored === "resolved"
    ) {
      return stored;
    }
  } catch {
    // Keep queue usable even when storage is unavailable.
  }
  return "all";
}

export function bandLabel(
  item: QueueItem,
): "At Risk" | "Unassigned" | "In Progress" | "Open" | "Resolved" {
  if (item.meta.state === "resolved") return "Resolved";
  if (item.isAtRisk) return "At Risk";
  if (item.meta.owner === "unassigned") return "Unassigned";
  if (item.meta.state === "in_progress") return "In Progress";
  return "Open";
}
