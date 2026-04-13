import { useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type {
  DispatchHistoryRecord,
  TriageClusterRecord,
} from "../types/queue";

export interface TriageTicketInput {
  id: string;
  summary: string;
}

export interface TriageClusterOutput {
  cluster_key: string;
  summary: string;
  ticket_ids: string[];
}

export interface CollaborationDispatchInput {
  integrationType: "jira" | "servicenow" | "slack" | "teams";
  draftId?: string | null;
  title: string;
  destinationLabel: string;
  payloadPreview: string;
  metadataJson?: string | null;
}

export interface QueueOpsClient {
  clusterTicketsForTriage: (
    tickets: TriageTicketInput[],
  ) => Promise<TriageClusterOutput[]>;
  listRecentTriageClusters: (limit?: number) => Promise<TriageClusterRecord[]>;
  previewCollaborationDispatch: (
    preview: CollaborationDispatchInput,
  ) => Promise<DispatchHistoryRecord>;
  confirmCollaborationDispatch: (
    dispatchId: string,
  ) => Promise<DispatchHistoryRecord>;
  cancelCollaborationDispatch: (
    dispatchId: string,
  ) => Promise<DispatchHistoryRecord>;
  listDispatchHistory: (
    limit?: number,
    status?: DispatchHistoryRecord["status"],
  ) => Promise<DispatchHistoryRecord[]>;
}

export function useQueueOps(): QueueOpsClient {
  const clusterTicketsForTriage = useCallback(
    async (tickets: TriageTicketInput[]): Promise<TriageClusterOutput[]> => {
      return invoke<TriageClusterOutput[]>("cluster_tickets_for_triage", {
        tickets,
      });
    },
    [],
  );

  const listRecentTriageClusters = useCallback(
    async (limit = 50): Promise<TriageClusterRecord[]> => {
      return invoke<TriageClusterRecord[]>("list_recent_triage_clusters", {
        limit,
      });
    },
    [],
  );

  const previewCollaborationDispatch = useCallback(
    async (
      preview: CollaborationDispatchInput,
    ): Promise<DispatchHistoryRecord> => {
      return invoke<DispatchHistoryRecord>("preview_collaboration_dispatch", {
        integrationType: preview.integrationType,
        draftId: preview.draftId ?? null,
        title: preview.title,
        destinationLabel: preview.destinationLabel,
        payloadPreview: preview.payloadPreview,
        metadataJson: preview.metadataJson ?? null,
      });
    },
    [],
  );

  const confirmCollaborationDispatch = useCallback(
    async (dispatchId: string): Promise<DispatchHistoryRecord> => {
      return invoke<DispatchHistoryRecord>("confirm_collaboration_dispatch", {
        dispatchId,
      });
    },
    [],
  );

  const cancelCollaborationDispatch = useCallback(
    async (dispatchId: string): Promise<DispatchHistoryRecord> => {
      return invoke<DispatchHistoryRecord>("cancel_collaboration_dispatch", {
        dispatchId,
      });
    },
    [],
  );

  const listDispatchHistory = useCallback(
    async (
      limit = 50,
      status?: DispatchHistoryRecord["status"],
    ): Promise<DispatchHistoryRecord[]> => {
      return invoke<DispatchHistoryRecord[]>("list_dispatch_history", {
        limit,
        status: status ?? null,
      });
    },
    [],
  );

  return {
    clusterTicketsForTriage,
    listRecentTriageClusters,
    previewCollaborationDispatch,
    confirmCollaborationDispatch,
    cancelCollaborationDispatch,
    listDispatchHistory,
  };
}
