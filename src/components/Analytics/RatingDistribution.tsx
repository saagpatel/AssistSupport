import type { AnalyticsSummary } from "../../hooks/useAnalytics";

export function RatingDistribution({ summary }: { summary: AnalyticsSummary }) {
  const totalRatings = summary.total_ratings;

  if (totalRatings === 0) {
    return (
      <div className="rating-distribution">
        <div className="section-title">Rating Distribution</div>
        <div className="analytics-empty">
          <div className="analytics-empty-description">No ratings yet</div>
        </div>
      </div>
    );
  }

  const ratingDistribution = Array.isArray(summary.rating_distribution)
    ? summary.rating_distribution
    : [];
  const distribution = [5, 4, 3, 2, 1].map((stars) => ({
    stars,
    count: ratingDistribution[stars - 1] ?? 0,
  }));

  const maxCount = Math.max(...distribution.map((d) => d.count), 1);

  return (
    <div className="rating-distribution">
      <div className="section-title">Rating Distribution</div>
      {distribution.map(({ stars, count }) => (
        <div key={stars} className="rating-row">
          <div className="rating-label">
            {stars} star{stars !== 1 ? "s" : ""}
          </div>
          <div className="rating-bar-track">
            <div
              className="rating-bar-fill"
              style={{ width: `${(count / maxCount) * 100}%` }}
            />
          </div>
          <div className="rating-count">{count}</div>
        </div>
      ))}
    </div>
  );
}
