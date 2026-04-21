// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useBatchTriageManager } from "./useBatchTriageManager";
import type { QueueItem } from "../../inbox/queueModel";
import type { SavedDraft } from "../../../types/workspace";

function makeItem(id: string, summary: string): QueueItem {
  return {
    draft: {
      id,
      ticket_id: `INC-${id}`,
      summary_text: summary,
      input_text: summary,
    } as unknown as SavedDraft,
    meta: {
      owner: "alice",
      state: "open",
      priority: "normal",
      updatedAt: "2026-04-01T00:00:00Z",
    },
    slaDueAt: "2026-04-02T00:00:00Z",
    isAtRisk: false,
  } as QueueItem;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("useBatchTriageManager", () => {
  it("seeds the input from the first 25 filtered items", () => {
    const { result } = renderHook(() =>
      useBatchTriageManager({
        filteredItems: [
          makeItem("1", "VPN down"),
          makeItem("2", "Password reset"),
        ],
        operatorName: "alice",
        clusterTicketsForTriage: vi.fn(),
        listRecentTriageClusters: vi.fn(async () => []),
        setTriageHistory: vi.fn(),
        logEvent: vi.fn(),
        showSuccess: vi.fn(),
        showError: vi.fn(),
      }),
    );

    act(() => result.current.handleSeedBatchTriage());

    expect(result.current.batchTriageInput).toBe(
      "INC-1|VPN down\nINC-2|Password reset",
    );
  });

  it("clusters tickets, refreshes history, and logs success", async () => {
    const cluster = vi.fn(async () => [
      {
        cluster_key: "outage",
        summary: "VPN outage",
        ticket_count: 1,
        ticket_ids: ["INC-1"],
      },
    ]);
    const listRecent = vi.fn(async () => [
      {
        id: "c1",
        cluster_key: "outage",
        summary: "VPN outage",
        ticket_count: 2,
      } as unknown as never,
    ]);
    const setTriageHistory = vi.fn();
    const showSuccess = vi.fn();
    const showError = vi.fn();

    const { result } = renderHook(() =>
      useBatchTriageManager({
        filteredItems: [],
        operatorName: "alice",
        clusterTicketsForTriage: cluster as never,
        listRecentTriageClusters: listRecent as never,
        setTriageHistory,
        logEvent: vi.fn(),
        showSuccess,
        showError,
      }),
    );

    act(() => {
      result.current.setBatchTriageInput("INC-1|VPN outage");
    });

    await act(async () => {
      await result.current.handleRunBatchTriage();
    });

    await waitFor(() => {
      expect(setTriageHistory).toHaveBeenCalled();
    });
    expect(cluster).toHaveBeenCalledWith([
      expect.objectContaining({ id: "INC-1", summary: "VPN outage" }),
    ]);
    expect(showSuccess).toHaveBeenCalledWith("Batch triage completed");
    expect(showError).not.toHaveBeenCalled();
  });

  it("surfaces an error when the input is empty", async () => {
    const showError = vi.fn();
    const cluster = vi.fn();

    const { result } = renderHook(() =>
      useBatchTriageManager({
        filteredItems: [],
        operatorName: "alice",
        clusterTicketsForTriage: cluster as never,
        listRecentTriageClusters: vi.fn(async () => []),
        setTriageHistory: vi.fn(),
        logEvent: vi.fn(),
        showSuccess: vi.fn(),
        showError,
      }),
    );

    await act(async () => {
      await result.current.handleRunBatchTriage();
    });

    expect(showError).toHaveBeenCalledWith(
      "Add at least one ticket before running batch triage",
    );
    expect(cluster).not.toHaveBeenCalled();
  });
});
