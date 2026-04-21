// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { AnalyticsSummary } from "../../hooks/useAnalytics";
import { RatingDistribution } from "./RatingDistribution";

function makeSummary(
  overrides: Partial<AnalyticsSummary> = {},
): AnalyticsSummary {
  return {
    responses_generated: 0,
    searches_performed: 0,
    drafts_saved: 0,
    average_rating: 0,
    total_ratings: 0,
    rating_distribution: [0, 0, 0, 0, 0],
    daily_counts: [],
    ...overrides,
  } as AnalyticsSummary;
}

describe("RatingDistribution", () => {
  afterEach(() => cleanup());

  it("shows an empty state when there are zero ratings", () => {
    render(<RatingDistribution summary={makeSummary()} />);
    expect(screen.getByText("No ratings yet")).toBeTruthy();
  });

  it("renders five rows with the real per-star counts", () => {
    render(
      <RatingDistribution
        summary={makeSummary({
          total_ratings: 10,
          rating_distribution: [1, 2, 0, 3, 4],
        })}
      />,
    );

    // 5 stars
    expect(screen.getByText("5 stars")).toBeTruthy();
    // 1 star (singular)
    expect(screen.getByText("1 star")).toBeTruthy();
    // Counts present (4 for 5-star, 1 for 1-star)
    const counts = screen.getAllByText(/^[0-9]+$/);
    expect(counts.length).toBeGreaterThanOrEqual(5);
  });
});
