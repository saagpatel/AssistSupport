// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  QualityDrilldownExamples,
  formatDrilldownMetric,
} from "./QualityDrilldownExamples";

describe("formatDrilldownMetric", () => {
  it("formats each signal's metric string", () => {
    expect(formatDrilldownMetric("edit_ratio", 0.42)).toBe("42.0% edit ratio");
    expect(formatDrilldownMetric("time_to_draft", 12000)).toBe(
      "12.0s to draft",
    );
    expect(formatDrilldownMetric("copy_per_save", 99)).toBe(
      "Saved without copy",
    );
    expect(formatDrilldownMetric("edited_save_rate", 0.8)).toBe(
      "80.0% edit ratio",
    );
  });
});

describe("QualityDrilldownExamples", () => {
  afterEach(() => cleanup());

  it("renders null when there is no drilldown payload", () => {
    const { container } = render(
      <QualityDrilldownExamples signalId="edit_ratio" drilldown={null} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders up to three draft examples for the given signal", () => {
    render(
      <QualityDrilldownExamples
        signalId="edit_ratio"
        drilldown={{
          edit_ratio: [
            {
              draft_id: "d1",
              created_at: "2026-04-01",
              metric_value: 0.5,
              draft_excerpt: "Drift example one",
            },
            {
              draft_id: "d2",
              created_at: "2026-04-02",
              metric_value: 0.7,
              draft_excerpt: "Drift example two",
            },
          ],
          time_to_draft: [],
          copy_per_save: [],
          edited_save_rate: [],
        }}
      />,
    );
    expect(screen.getByText("d1")).toBeTruthy();
    expect(screen.getByText("d2")).toBeTruthy();
    expect(screen.getByText("Drift example one")).toBeTruthy();
  });
});
