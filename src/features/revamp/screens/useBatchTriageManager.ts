import { useCallback, useState } from "react";
import type { TriageClusterRecord } from "../../../types/queue";
import type {
  TriageClusterOutput,
  TriageTicketInput,
} from "../../../hooks/useQueueOps";
import type { QueueItem } from "../../inbox/queueModel";
import {
  formatBatchTriageOutput,
  parseBatchTriageInput,
} from "../../inbox/queueCommandCenterHelpers";
import { formatTicketLabel } from "./queueHelpers";

interface UseBatchTriageManagerArgs {
  filteredItems: QueueItem[];
  operatorName: string;
  clusterTicketsForTriage: (
    tickets: TriageTicketInput[],
  ) => Promise<TriageClusterOutput[]>;
  listRecentTriageClusters: (limit?: number) => Promise<TriageClusterRecord[]>;
  setTriageHistory: React.Dispatch<React.SetStateAction<TriageClusterRecord[]>>;
  logEvent: (
    eventName: string,
    properties?: Record<string, unknown>,
  ) => Promise<unknown> | unknown;
  showSuccess: (msg: string) => void;
  showError: (msg: string) => void;
}

export interface UseBatchTriageManagerResult {
  batchTriageInput: string;
  setBatchTriageInput: React.Dispatch<React.SetStateAction<string>>;
  batchTriageOutput: string;
  batchTriageBusy: boolean;
  handleSeedBatchTriage: () => void;
  handleRunBatchTriage: () => Promise<void>;
}

export function useBatchTriageManager({
  filteredItems,
  operatorName,
  clusterTicketsForTriage,
  listRecentTriageClusters,
  setTriageHistory,
  logEvent,
  showSuccess,
  showError,
}: UseBatchTriageManagerArgs): UseBatchTriageManagerResult {
  const [batchTriageInput, setBatchTriageInput] = useState("");
  const [batchTriageOutput, setBatchTriageOutput] = useState("");
  const [batchTriageBusy, setBatchTriageBusy] = useState(false);

  const handleSeedBatchTriage = useCallback(() => {
    const nextInput = filteredItems
      .slice(0, 25)
      .map(
        (item) =>
          `${formatTicketLabel(item.draft)}|${item.draft.summary_text || item.draft.input_text}`,
      )
      .join("\n");
    setBatchTriageInput(nextInput);
  }, [filteredItems]);

  const handleRunBatchTriage = useCallback(async () => {
    const tickets = parseBatchTriageInput(batchTriageInput);
    if (tickets.length === 0) {
      showError("Add at least one ticket before running batch triage");
      return;
    }

    setBatchTriageBusy(true);
    try {
      const clusters = await clusterTicketsForTriage(tickets);
      setBatchTriageOutput(formatBatchTriageOutput(clusters));
      const refreshed = await listRecentTriageClusters(20).catch(() => []);
      setTriageHistory(refreshed);
      void logEvent("queue_batch_triage_ran", {
        operator: operatorName,
        ticket_count: tickets.length,
        cluster_count: clusters.length,
      });
      showSuccess("Batch triage completed");
    } catch (error) {
      showError(`Batch triage failed: ${error}`);
    } finally {
      setBatchTriageBusy(false);
    }
  }, [
    batchTriageInput,
    clusterTicketsForTriage,
    listRecentTriageClusters,
    setTriageHistory,
    logEvent,
    operatorName,
    showSuccess,
    showError,
  ]);

  return {
    batchTriageInput,
    setBatchTriageInput,
    batchTriageOutput,
    batchTriageBusy,
    handleSeedBatchTriage,
    handleRunBatchTriage,
  };
}
