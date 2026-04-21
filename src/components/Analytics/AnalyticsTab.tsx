import { useState, useEffect } from "react";
import type { ResponseQualityThresholds } from "../../features/analytics/qualityThresholds";
import {
  readCurrentThresholds,
  subscribeToQualityThresholds,
} from "./qualityThresholdsState";
import { ArticleDetailPanel } from "./ArticleDetailPanel";
import { PilotDiagnosticsSection } from "./PilotDiagnosticsSection";
import { RatingDistribution } from "./RatingDistribution";
import { KbUsageTable } from "./KbUsageTable";
import { ResponseQualityPanel } from "./ResponseQualityPanel";
import { useAnalyticsLoader, type AnalyticsPeriod } from "./useAnalyticsLoader";
import "./AnalyticsTab.css";

type AnalyticsSection = "overview" | "pilot";

interface AnalyticsTabProps {
  initialSection?: AnalyticsSection;
}

const PERIODS: { label: string; value: AnalyticsPeriod }[] = [
  { label: "7 days", value: 7 },
  { label: "30 days", value: 30 },
  { label: "90 days", value: 90 },
  { label: "All time", value: null },
];

export function AnalyticsTab({
  initialSection = "overview",
}: AnalyticsTabProps) {
  const {
    summary,
    qualitySummary,
    qualityDrilldown,
    kbUsage,
    lowRatingData,
    gapCandidates,
    loading,
    error,
    period,
    setPeriod,
    updateGapStatus,
  } = useAnalyticsLoader();
  const [activeSection, setActiveSection] =
    useState<AnalyticsSection>(initialSection);
  const [qualityThresholds, setQualityThresholds] =
    useState<ResponseQualityThresholds>(() => readCurrentThresholds());
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    setActiveSection(initialSection);
  }, [initialSection]);

  useEffect(() => {
    setQualityThresholds(readCurrentThresholds());
    return subscribeToQualityThresholds(setQualityThresholds);
  }, []);

  const overviewContent = (() => {
    if (loading) {
      return <div className="analytics-loading">Loading analytics...</div>;
    }

    if (error) {
      return (
        <div className="analytics-empty">
          <div className="analytics-empty-title">Unable to load analytics</div>
          <div className="analytics-empty-description">{error}</div>
        </div>
      );
    }

    if (!summary) {
      return (
        <div className="analytics-empty">
          <div className="analytics-empty-title">No analytics data</div>
          <div className="analytics-empty-description">
            Start using AssistSupport to see usage statistics here.
          </div>
        </div>
      );
    }

    const dailyCounts = Array.isArray(summary.daily_counts)
      ? summary.daily_counts
      : [];
    const maxDailyCount = Math.max(...dailyCounts.map((d) => d.count), 1);
    const feedbackCategories = Array.isArray(lowRatingData?.feedback_categories)
      ? lowRatingData.feedback_categories
      : [];
    const recentFeedback = Array.isArray(lowRatingData?.recent_feedback)
      ? lowRatingData.recent_feedback
      : [];

    return (
      <>
        <div
          className="period-selector"
          role="tablist"
          aria-label="Analytics period"
        >
          {PERIODS.map((p) => (
            <button
              key={p.label}
              className={`period-btn ${period === p.value ? "active" : ""}`}
              onClick={() => setPeriod(p.value)}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="stat-cards">
          <div
            className="stat-card stat-card-clickable"
            title="View response details"
          >
            <div className="stat-card-label">Total Responses</div>
            <div className="stat-card-value">{summary.responses_generated}</div>
          </div>
          <div
            className="stat-card stat-card-clickable"
            title="View search details"
          >
            <div className="stat-card-label">Searches</div>
            <div className="stat-card-value">{summary.searches_performed}</div>
          </div>
          <div
            className="stat-card stat-card-clickable"
            title="View draft details"
          >
            <div className="stat-card-label">Drafts Saved</div>
            <div className="stat-card-value">{summary.drafts_saved}</div>
          </div>
          <div
            className="stat-card stat-card-clickable"
            title="View rating details"
          >
            <div className="stat-card-label">Avg Rating</div>
            <div className="stat-card-value">
              {summary.total_ratings > 0
                ? summary.average_rating.toFixed(1)
                : "--"}
            </div>
          </div>
        </div>

        <div className="charts-grid">
          <div className="bar-chart">
            <div className="bar-chart-title">Daily Activity</div>
            {dailyCounts.length > 0 ? (
              <div className="bar-chart-grid">
                {dailyCounts.map((day) => {
                  const heightPercent = (day.count / maxDailyCount) * 100;
                  const dateLabel = formatDateLabel(day.date);
                  return (
                    <div
                      key={day.date}
                      className="bar-col"
                      title={`${day.date}: ${day.count} events`}
                    >
                      <div
                        className="bar-fill"
                        style={{ height: `${heightPercent}%` }}
                      />
                      <div className="bar-label">{dateLabel}</div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="analytics-empty">
                <div className="analytics-empty-description">
                  No activity data for this period
                </div>
              </div>
            )}
          </div>

          <RatingDistribution summary={summary} />
        </div>

        <ResponseQualityPanel
          summary={qualitySummary}
          thresholds={qualityThresholds}
          drilldown={qualityDrilldown}
        />

        {lowRatingData && lowRatingData.low_rating_count > 0 && (
          <div className="low-rating-alert">
            <div className="section-title">Quality Alert</div>
            <div className="low-rating-summary">
              <strong>{lowRatingData.low_rating_count}</strong> low ratings (
              {lowRatingData.low_rating_percentage.toFixed(1)}% of{" "}
              {lowRatingData.total_rating_count} total)
            </div>
            {feedbackCategories.length > 0 && (
              <div className="feedback-categories">
                <div className="feedback-categories-title">
                  Top Feedback Categories
                </div>
                {feedbackCategories.map((cat) => (
                  <div key={cat.category} className="feedback-category-row">
                    <span className="feedback-category-name">
                      {cat.category}
                    </span>
                    <span className="feedback-category-count">{cat.count}</span>
                  </div>
                ))}
              </div>
            )}
            {recentFeedback.length > 0 && (
              <div className="recent-feedback">
                <div className="recent-feedback-title">Recent Feedback</div>
                {recentFeedback.slice(0, 5).map((fb, i) => (
                  <div key={i} className="feedback-item">
                    <span className="feedback-item-rating">
                      {"★".repeat(fb.rating)}
                      {"☆".repeat(5 - fb.rating)}
                    </span>
                    <span className="feedback-item-text">
                      {fb.feedback_text}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <KbUsageTable
          articles={kbUsage}
          onArticleClick={setSelectedArticleId}
        />

        <div className="kb-gap-panel">
          <div className="analytics-panel-header">
            <div>
              <div className="section-title">Knowledge Gaps</div>
              <p className="analytics-panel-subtitle">
                Review low-confidence or ungrounded topics that may need KB
                coverage.
              </p>
            </div>
          </div>
          {gapCandidates.length === 0 ? (
            <div className="analytics-empty">
              <div className="analytics-empty-description">
                No open gap candidates detected
              </div>
            </div>
          ) : (
            <div className="kb-gap-list">
              {gapCandidates.map((gap) => (
                <div key={gap.id} className="kb-gap-item">
                  <div className="kb-gap-title">{gap.sample_query}</div>
                  <div className="kb-gap-meta">
                    <span>Occurrences: {gap.occurrences}</span>
                    <span>Low confidence: {gap.low_confidence_count}</span>
                    <span>Ungrounded: {gap.unsupported_claim_events}</span>
                    {gap.suggested_category && (
                      <span>Category: {gap.suggested_category}</span>
                    )}
                  </div>
                  <div className="kb-gap-actions">
                    <button
                      className="kb-gap-btn"
                      onClick={() => updateGapStatus(gap.id, "accepted")}
                    >
                      Accept
                    </button>
                    <button
                      className="kb-gap-btn"
                      onClick={() => updateGapStatus(gap.id, "resolved")}
                    >
                      Resolve
                    </button>
                    <button
                      className="kb-gap-btn kb-gap-btn-muted"
                      onClick={() => updateGapStatus(gap.id, "ignored")}
                    >
                      Ignore
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {selectedArticleId && (
          <ArticleDetailPanel
            documentId={selectedArticleId}
            onClose={() => setSelectedArticleId(null)}
          />
        )}
      </>
    );
  })();

  return (
    <div className="analytics-tab">
      <header className="analytics-page-header">
        <div>
          <h2>Analytics</h2>
          <p className="analytics-page-subtitle">
            Insights, response quality, knowledge gaps, and pilot diagnostics
            for the local support workflow.
          </p>
        </div>
        <div
          className="analytics-section-picker"
          role="tablist"
          aria-label="Analytics sections"
        >
          <button
            type="button"
            className={`analytics-section-btn ${activeSection === "overview" ? "active" : ""}`}
            onClick={() => setActiveSection("overview")}
            role="tab"
            aria-selected={activeSection === "overview"}
          >
            Overview
          </button>
          <button
            type="button"
            className={`analytics-section-btn ${activeSection === "pilot" ? "active" : ""}`}
            onClick={() => setActiveSection("pilot")}
            role="tab"
            aria-selected={activeSection === "pilot"}
          >
            Pilot Diagnostics
          </button>
        </div>
      </header>

      {activeSection === "overview" ? (
        <section
          className="analytics-section-surface"
          aria-label="Analytics overview"
        >
          {overviewContent}
        </section>
      ) : (
        <PilotDiagnosticsSection />
      )}
    </div>
  );
}

/** Format a date string (YYYY-MM-DD) into a short label (e.g., "Jan 5") */
function formatDateLabel(dateStr: string): string {
  try {
    const date = new Date(dateStr + "T00:00:00");
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return dateStr;
  }
}
