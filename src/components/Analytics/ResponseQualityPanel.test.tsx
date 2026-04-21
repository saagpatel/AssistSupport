// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResponseQualityPanel } from "./ResponseQualityPanel";
import type { ResponseQualityThresholds } from "../../features/analytics/qualityThresholds";

vi.mock("../../features/analytics/qualityCoaching", () => ({
  buildResponseQualityCoaching: () => null,
}));
vi.mock("../../features/analytics/operatorScorecard", () => ({
  buildOperatorScorecard: () => null,
}));
vi.mock("../../features/inbox/queueModel", () => ({
  loadQueueHandoffSnapshot: () => null,
}));

const thresholds: ResponseQualityThresholds = {
  edit_ratio_watch: 0.3,
  edit_ratio_action: 0.5,
  time_to_draft_watch_ms: 30000,
  time_to_draft_action_ms: 60000,
  copy_per_save_watch: 0.5,
  copy_per_save_action: 0.3,
  edited_save_rate_watch: 0.5,
  edited_save_rate_action: 0.7,
};

describe("ResponseQualityPanel", () => {
  afterEach(() => cleanup());

  it("shows the empty state when there are no snapshots", () => {
    render(
      <ResponseQualityPanel
        summary={null}
        thresholds={thresholds}
        drilldown={null}
      />,
    );
    expect(
      screen.getByText("No response quality snapshots captured yet"),
    ).toBeTruthy();
  });

  it("renders the metric grid when a snapshot summary is provided", () => {
    render(
      <ResponseQualityPanel
        summary={{
          snapshots_count: 4,
          avg_word_count: 82,
          avg_edit_ratio: 0.12,
          edited_save_rate: 0.4,
          avg_time_to_draft_ms: 5400,
          median_time_to_draft_ms: 4200,
          copy_per_saved_ratio: 0.9,
          saved_count: 3,
        }}
        thresholds={thresholds}
        drilldown={null}
      />,
    );
    expect(screen.getByText("Snapshots")).toBeTruthy();
    expect(screen.getByText("4")).toBeTruthy();
    expect(screen.getByText("Avg Words")).toBeTruthy();
    expect(screen.getByText("82")).toBeTruthy();
  });
});
