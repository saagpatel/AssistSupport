import { useCallback, useEffect, useState } from "react";
import type { CollaborationDispatchPreview } from "../../../types/workspace";
import type { DispatchHistoryRecord } from "../../../types/queue";
import type { QueueItem } from "../../inbox/queueModel";
import { buildQueueDispatchPreview } from "../../inbox/queueCommandCenterHelpers";
import { resolveRevampFlags } from "../../revamp";

interface UseDispatchManagerArgs {
  operatorName: string;
  previewCollaborationDispatch: (args: {
    integrationType: CollaborationDispatchPreview["integration_type"];
    draftId: string;
    title: string;
    destinationLabel: string;
    payloadPreview: string;
    metadataJson?: string;
  }) => Promise<DispatchHistoryRecord>;
  confirmCollaborationDispatch: (
    dispatchId: string,
  ) => Promise<DispatchHistoryRecord>;
  cancelCollaborationDispatch: (
    dispatchId: string,
  ) => Promise<DispatchHistoryRecord>;
  listDispatchHistory: (limit?: number) => Promise<DispatchHistoryRecord[]>;
  logEvent: (
    eventName: string,
    properties?: Record<string, unknown>,
  ) => Promise<unknown> | unknown;
  showSuccess: (msg: string) => void;
  showError: (msg: string) => void;
}

export interface UseDispatchManagerResult {
  dispatchTarget: CollaborationDispatchPreview["integration_type"];
  setDispatchTarget: React.Dispatch<
    React.SetStateAction<CollaborationDispatchPreview["integration_type"]>
  >;
  dispatchPreview: CollaborationDispatchPreview | null;
  dispatchHistory: DispatchHistoryRecord[];
  pendingDispatchId: string | null;
  handlePreviewDispatch: (currentItem: QueueItem | null) => void;
  handleSendDispatch: () => Promise<void>;
  handleCancelDispatch: () => Promise<void>;
}

export function useDispatchManager({
  operatorName,
  previewCollaborationDispatch,
  confirmCollaborationDispatch,
  cancelCollaborationDispatch,
  listDispatchHistory,
  logEvent,
  showSuccess,
  showError,
}: UseDispatchManagerArgs): UseDispatchManagerResult {
  const [dispatchTarget, setDispatchTarget] =
    useState<CollaborationDispatchPreview["integration_type"]>("jira");
  const [dispatchPreview, setDispatchPreview] =
    useState<CollaborationDispatchPreview | null>(null);
  const [dispatchHistory, setDispatchHistory] = useState<
    DispatchHistoryRecord[]
  >([]);
  const [pendingDispatchId, setPendingDispatchId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    const flags = resolveRevampFlags();
    if (!flags.ASSISTSUPPORT_COLLABORATION_DISPATCH) {
      setDispatchHistory([]);
      return;
    }
    listDispatchHistory(20)
      .then(setDispatchHistory)
      .catch(() => setDispatchHistory([]));
  }, [listDispatchHistory]);

  const handlePreviewDispatch = useCallback(
    (currentItem: QueueItem | null) => {
      if (!currentItem) {
        showError("Select a work item before previewing a dispatch");
        return;
      }

      const preview = buildQueueDispatchPreview(currentItem, dispatchTarget);
      void previewCollaborationDispatch({
        integrationType: preview.integration_type,
        draftId: currentItem.draft.id,
        title: preview.title,
        destinationLabel: preview.destination_label,
        payloadPreview: preview.payload_preview,
        metadataJson: JSON.stringify({
          operator: operatorName,
          ticket_id: currentItem.draft.ticket_id,
        }),
      })
        .then(async (record) => {
          setDispatchPreview(preview);
          setPendingDispatchId(record.id);
          setDispatchHistory(await listDispatchHistory(20).catch(() => []));
          void logEvent("queue_dispatch_previewed", {
            operator: operatorName,
            draft_id: currentItem.draft.id,
            integration_type: dispatchTarget,
          });
        })
        .catch((error) => {
          showError(`Could not preview dispatch: ${error}`);
        });
    },
    [
      dispatchTarget,
      operatorName,
      previewCollaborationDispatch,
      listDispatchHistory,
      logEvent,
      showError,
    ],
  );

  const handleSendDispatch = useCallback(async () => {
    if (!pendingDispatchId || !dispatchPreview) {
      showError("Preview a dispatch before confirming delivery");
      return;
    }

    try {
      const record = await confirmCollaborationDispatch(pendingDispatchId);
      setDispatchHistory(await listDispatchHistory(20).catch(() => []));
      setDispatchPreview(null);
      setPendingDispatchId(null);
      void logEvent("queue_dispatch_sent", {
        operator: operatorName,
        integration_type: record.integration_type,
        dispatch_id: record.id,
      });
      showSuccess(`${record.destination_label} dispatch confirmed as sent`);
    } catch (error) {
      showError(`Failed to confirm dispatch: ${error}`);
    }
  }, [
    pendingDispatchId,
    dispatchPreview,
    confirmCollaborationDispatch,
    listDispatchHistory,
    logEvent,
    operatorName,
    showSuccess,
    showError,
  ]);

  const handleCancelDispatch = useCallback(async () => {
    if (!pendingDispatchId) {
      setDispatchPreview(null);
      return;
    }

    try {
      await cancelCollaborationDispatch(pendingDispatchId);
      setDispatchHistory(await listDispatchHistory(20).catch(() => []));
      setDispatchPreview(null);
      setPendingDispatchId(null);
      showSuccess("Dispatch preview cancelled");
    } catch (error) {
      showError(`Failed to cancel dispatch: ${error}`);
    }
  }, [
    pendingDispatchId,
    cancelCollaborationDispatch,
    listDispatchHistory,
    showSuccess,
    showError,
  ]);

  return {
    dispatchTarget,
    setDispatchTarget,
    dispatchPreview,
    dispatchHistory,
    pendingDispatchId,
    handlePreviewDispatch,
    handleSendDispatch,
    handleCancelDispatch,
  };
}
