import { useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { KbGapCandidate } from "../types/insights";

export interface InsightsOpsClient {
  getKbGapCandidates: (
    limit?: number,
    status?: string,
  ) => Promise<KbGapCandidate[]>;
  updateKbGapStatus: (
    id: string,
    status: "open" | "accepted" | "resolved" | "ignored",
    resolutionNote?: string,
  ) => Promise<void>;
}

export function useInsightsOps(): InsightsOpsClient {
  const getKbGapCandidates = useCallback(
    async (limit = 20, status = "open"): Promise<KbGapCandidate[]> => {
      return invoke<KbGapCandidate[]>("get_kb_gap_candidates", {
        limit,
        status,
      });
    },
    [],
  );

  const updateKbGapStatus = useCallback(
    async (
      id: string,
      status: "open" | "accepted" | "resolved" | "ignored",
      resolutionNote?: string,
    ): Promise<void> => {
      await invoke("update_kb_gap_status", {
        id,
        status,
        resolutionNote: resolutionNote ?? null,
      });
    },
    [],
  );

  return {
    getKbGapCandidates,
    updateKbGapStatus,
  };
}
