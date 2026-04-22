// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnalyticsTab } from "./AnalyticsTab";

const getSummary = vi.fn();
const getKbUsage = vi.fn();
const getLowRatingAnalysis = vi.fn();
const getResponseQualitySummary = vi.fn();
const getResponseQualityDrilldownExamples = vi.fn();
const getKbGapCandidates = vi.fn();
const updateKbGapStatus = vi.fn();
const invokeMock = vi.fn();

vi.mock("../../hooks/useAnalytics", () => ({
  useAnalytics: () => ({
    getSummary,
    getKbUsage,
    getLowRatingAnalysis,
    getResponseQualitySummary,
    getResponseQualityDrilldownExamples,
  }),
}));

vi.mock("../../hooks/useInsightsOps", () => ({
  useInsightsOps: () => ({
    getKbGapCandidates,
    updateKbGapStatus,
  }),
}));

vi.mock("../shared/Button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    loading: _loading,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) => (
    <button type="button" onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

vi.mock("../../features/inbox/queueModel", () => ({
  loadQueueHandoffSnapshot: () => null,
}));

vi.mock("../../features/analytics/qualityCoaching", () => ({
  buildResponseQualityCoaching: () => null,
}));

vi.mock("../../features/analytics/operatorScorecard", () => ({
  buildOperatorScorecard: () => null,
}));

vi.mock("./ArticleDetailPanel", () => ({
  ArticleDetailPanel: () => <div>Article detail panel</div>,
}));

function mockOverviewData() {
  getSummary.mockResolvedValue({
    total_events: 12,
    responses_generated: 4,
    searches_performed: 3,
    drafts_saved: 2,
    daily_counts: [{ date: "2026-03-20", count: 4 }],
    average_rating: 4.2,
    total_ratings: 2,
    rating_distribution: [0, 0, 0, 1, 1],
  });
  getKbUsage.mockResolvedValue([]);
  getLowRatingAnalysis.mockResolvedValue(null);
  getResponseQualitySummary.mockResolvedValue({
    snapshots_count: 0,
    saved_count: 0,
    copied_count: 0,
    avg_word_count: 0,
    avg_edit_ratio: 0,
    edited_save_rate: 0,
    avg_time_to_draft_ms: null,
    median_time_to_draft_ms: null,
    copy_per_saved_ratio: 0,
  });
  getResponseQualityDrilldownExamples.mockResolvedValue({
    edit_ratio: [],
    time_to_draft: [],
    copy_per_save: [],
    edited_save_rate: [],
  });
  getKbGapCandidates.mockResolvedValue([]);
  updateKbGapStatus.mockResolvedValue(undefined);
}

function mockPilotInvoke({
  policyEnabled = true,
  totalQueries = 0,
  logs = [] as Array<Record<string, string>>,
}: {
  policyEnabled?: boolean;
  totalQueries?: number;
  logs?: Array<Record<string, string>>;
}) {
  invokeMock.mockImplementation((command: string) => {
    switch (command) {
      case "get_pilot_logging_policy":
        return Promise.resolve({
          enabled: policyEnabled,
          retention_days: 14,
          max_rows: 500,
        });
      case "get_pilot_stats":
        return Promise.resolve({
          total_queries: totalQueries,
          total_feedback: totalQueries,
          accuracy_pct: totalQueries > 0 ? 100 : 0,
          clarity_avg: totalQueries > 0 ? 4.8 : 0,
          helpfulness_avg: totalQueries > 0 ? 4.7 : 0,
          by_category: [],
        });
      case "get_pilot_query_logs":
        return Promise.resolve(logs);
      default:
        return Promise.reject(new Error(`Unexpected invoke: ${command}`));
    }
  });
}

beforeEach(() => {
  mockOverviewData();
  mockPilotInvoke({});
});

afterEach(() => {
  cleanup();
  invokeMock.mockReset();
  getSummary.mockReset();
  getKbUsage.mockReset();
  getLowRatingAnalysis.mockReset();
  getResponseQualitySummary.mockReset();
  getResponseQualityDrilldownExamples.mockReset();
  getKbGapCandidates.mockReset();
  updateKbGapStatus.mockReset();
  localStorage.clear();
});

describe("AnalyticsTab", () => {
  it("defaults to the Overview section and keeps pilot-only actions hidden there", async () => {
    render(<AnalyticsTab />);

    expect(await screen.findByText("Total Responses")).toBeTruthy();
    expect(
      screen
        .getByRole("tab", { name: "Overview" })
        .getAttribute("aria-selected"),
    ).toBe("true");
    expect(screen.queryByText("Export CSV")).toBeNull();
    expect(screen.queryByText("Test a Query")).toBeNull();
  });

  it("renders pilot diagnostics when requested and shows the query tester", async () => {
    render(<AnalyticsTab initialSection="pilot" />);

    expect(await screen.findByText("Test a Query")).toBeTruthy();
    expect(
      screen
        .getByRole("tab", { name: "Pilot Diagnostics" })
        .getAttribute("aria-selected"),
    ).toBe("true");
    expect(
      await screen.findByRole("heading", { name: "Pilot Progress" }),
    ).toBeTruthy();
  });

  it("shows the disabled pilot logging state in diagnostics when policy is off", async () => {
    mockOverviewData();
    mockPilotInvoke({ policyEnabled: false });

    render(<AnalyticsTab initialSection="pilot" />);

    expect(
      await screen.findAllByText(/Pilot logging is disabled by policy/i),
    ).toHaveLength(2);
  });

  it("shows the pilot empty state when logging is enabled but no stats exist yet", async () => {
    render(<AnalyticsTab initialSection="pilot" />);

    expect(await screen.findByText(/No pilot data yet/i)).toBeTruthy();
    expect(screen.queryByText("Export CSV")).toBeNull();
  });

  it("keeps raw logs hidden by default and reveals them only after an explicit action", async () => {
    const user = userEvent.setup();
    mockOverviewData();
    mockPilotInvoke({
      totalQueries: 1,
      logs: [
        {
          id: "log-1",
          query: "Can I use a flash drive?",
          response: "Follow policy guidance.",
          category: "policy",
          user_id: "op-123",
          created_at: "2026-03-20T10:00:00.000Z",
        },
      ],
    });

    render(<AnalyticsTab initialSection="pilot" />);

    expect(await screen.findByText("Show Query Log (1)")).toBeTruthy();
    expect(screen.queryByText("Can I use a flash drive?")).toBeNull();

    await user.click(
      screen.getByRole("button", { name: "Show Query Log (1)" }),
    );

    expect(await screen.findByText("Can I use a flash drive?")).toBeTruthy();
  });

  it("shows export controls only inside pilot diagnostics when pilot data exists", async () => {
    const user = userEvent.setup();
    mockOverviewData();
    mockPilotInvoke({ totalQueries: 1 });

    render(<AnalyticsTab />);
    expect(await screen.findByText("Total Responses")).toBeTruthy();
    expect(screen.queryByText("Export CSV")).toBeNull();

    await user.click(screen.getByRole("tab", { name: "Pilot Diagnostics" }));

    await waitFor(() => {
      expect(screen.getByText("Export CSV")).toBeTruthy();
    });
  });

  it("stays on the overview surface when live analytics payloads omit optional arrays", async () => {
    getSummary.mockResolvedValue({
      total_events: 12,
      responses_generated: 4,
      searches_performed: 3,
      drafts_saved: 2,
      daily_counts: undefined,
      average_rating: 4.2,
      total_ratings: 2,
      rating_distribution: undefined,
    });
    getLowRatingAnalysis.mockResolvedValue({
      low_rating_count: 1,
      total_rating_count: 2,
      low_rating_percentage: 50,
      feedback_categories: undefined,
      recent_feedback: undefined,
    });
    getResponseQualitySummary.mockResolvedValue({
      snapshots_count: 1,
      saved_count: 1,
      copied_count: 0,
      avg_word_count: 12,
      avg_edit_ratio: 0.15,
      edited_save_rate: 0.25,
      avg_time_to_draft_ms: 900,
      median_time_to_draft_ms: 700,
      copy_per_saved_ratio: 0,
    });
    getResponseQualityDrilldownExamples.mockResolvedValue({
      edit_ratio: undefined,
      time_to_draft: undefined,
      copy_per_save: undefined,
      edited_save_rate: undefined,
    });

    render(<AnalyticsTab />);

    expect(await screen.findByText("Total Responses")).toBeTruthy();
    expect(screen.getByText("Quality Alert")).toBeTruthy();
  });
});
