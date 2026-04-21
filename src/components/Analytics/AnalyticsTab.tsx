import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  useAnalytics,
  AnalyticsSummary,
  ArticleUsage,
  LowRatingAnalysis,
  ResponseQualityDrilldownExamples,
  ResponseQualitySummary,
} from "../../hooks/useAnalytics";
import { useInsightsOps } from "../../hooks/useInsightsOps";
import {
  getResponseQualityThresholds,
  RESPONSE_QUALITY_THRESHOLDS_UPDATED_EVENT,
  ResponseQualityThresholds,
} from "../../features/analytics/qualityThresholds";
import type { KbGapCandidate } from "../../types/insights";
import { ArticleDetailPanel } from "./ArticleDetailPanel";
import { PilotDashboard, PilotQueryTester } from "../Pilot";
import { RatingDistribution } from "./RatingDistribution";
import { KbUsageTable } from "./KbUsageTable";
import { ResponseQualityPanel } from "./ResponseQualityPanel";
import "./AnalyticsTab.css";

type Period = 7 | 30 | 90 | null; // null = all time
type AnalyticsSection = "overview" | "pilot";

interface AnalyticsTabProps {
  initialSection?: AnalyticsSection;
}

interface PilotLoggingPolicy {
  enabled: boolean;
  retention_days: number;
  max_rows: number;
}

const PERIODS: { label: string; value: Period }[] = [
  { label: "7 days", value: 7 },
  { label: "30 days", value: 30 },
  { label: "90 days", value: 90 },
  { label: "All time", value: null },
];

export function AnalyticsTab({
  initialSection = "overview",
}: AnalyticsTabProps) {
  const {
    getSummary,
    getKbUsage,
    getLowRatingAnalysis,
    getResponseQualitySummary,
    getResponseQualityDrilldownExamples,
  } = useAnalytics();
  const { getKbGapCandidates, updateKbGapStatus } = useInsightsOps();
  const [activeSection, setActiveSection] =
    useState<AnalyticsSection>(initialSection);
  const [period, setPeriod] = useState<Period>(30);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [qualitySummary, setQualitySummary] =
    useState<ResponseQualitySummary | null>(null);
  const [qualityDrilldown, setQualityDrilldown] =
    useState<ResponseQualityDrilldownExamples | null>(null);
  const [qualityThresholds, setQualityThresholds] =
    useState<ResponseQualityThresholds>(() => getResponseQualityThresholds());
  const [kbUsage, setKbUsage] = useState<ArticleUsage[]>([]);
  const [lowRatingData, setLowRatingData] = useState<LowRatingAnalysis | null>(
    null,
  );
  const [gapCandidates, setGapCandidates] = useState<KbGapCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    setActiveSection(initialSection);
  }, [initialSection]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [
        summaryData,
        kbData,
        lowRating,
        qualityData,
        qualityDrilldownData,
      ] = await Promise.all([
        getSummary(period ?? undefined),
        getKbUsage(period ?? undefined),
        getLowRatingAnalysis(period ?? undefined).catch(() => null),
        getResponseQualitySummary(period ?? undefined).catch(() => null),
        getResponseQualityDrilldownExamples(period ?? undefined, 6).catch(
          () => null,
        ),
      ]);
      const gaps = await getKbGapCandidates(12, "open").catch(() => []);
      setSummary(summaryData);
      setQualitySummary(qualityData);
      setQualityDrilldown(qualityDrilldownData);
      setKbUsage(kbData);
      setLowRatingData(lowRating);
      setGapCandidates(gaps);
    } catch (err) {
      console.error("Failed to load analytics:", err);
      setError(typeof err === "string" ? err : "Failed to load analytics data");
    } finally {
      setLoading(false);
    }
  }, [
    period,
    getSummary,
    getKbUsage,
    getLowRatingAnalysis,
    getResponseQualitySummary,
    getResponseQualityDrilldownExamples,
    getKbGapCandidates,
  ]);

  const handleGapStatus = useCallback(
    async (id: string, status: "accepted" | "resolved" | "ignored") => {
      await updateKbGapStatus(id, status);
      setGapCandidates((prev) => prev.filter((g) => g.id !== id));
    },
    [updateKbGapStatus],
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const syncThresholds = () =>
      setQualityThresholds(getResponseQualityThresholds());
    syncThresholds();
    window.addEventListener(
      RESPONSE_QUALITY_THRESHOLDS_UPDATED_EVENT,
      syncThresholds,
    );
    window.addEventListener("storage", syncThresholds);
    return () => {
      window.removeEventListener(
        RESPONSE_QUALITY_THRESHOLDS_UPDATED_EVENT,
        syncThresholds,
      );
      window.removeEventListener("storage", syncThresholds);
    };
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
                      onClick={() => handleGapStatus(gap.id, "accepted")}
                    >
                      Accept
                    </button>
                    <button
                      className="kb-gap-btn"
                      onClick={() => handleGapStatus(gap.id, "resolved")}
                    >
                      Resolve
                    </button>
                    <button
                      className="kb-gap-btn kb-gap-btn-muted"
                      onClick={() => handleGapStatus(gap.id, "ignored")}
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

function PilotDiagnosticsSection() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [policy, setPolicy] = useState<PilotLoggingPolicy | null>(null);
  const pilotLoggingEnabled = policy?.enabled ?? false;

  useEffect(() => {
    invoke<PilotLoggingPolicy>("get_pilot_logging_policy")
      .then(setPolicy)
      .catch(() =>
        setPolicy({ enabled: false, retention_days: 14, max_rows: 500 }),
      );
  }, []);

  const handleQueryLogged = useCallback(() => {
    setRefreshKey((current) => current + 1);
  }, []);

  return (
    <section
      className="analytics-section-surface analytics-section-surface-pilot"
      aria-label="Pilot diagnostics"
    >
      <div className="analytics-panel-card">
        <div className="analytics-panel-header">
          <div>
            <div className="section-title">Pilot Diagnostics</div>
            <p className="analytics-panel-subtitle">
              Validate query quality, pilot logging posture, and raw-log
              evidence without a separate Pilot tab.
            </p>
          </div>
        </div>
        <PilotQueryTester
          pilotLoggingEnabled={pilotLoggingEnabled}
          policy={policy}
          onQueryLogged={handleQueryLogged}
        />
      </div>

      <div className="analytics-panel-card">
        <PilotDashboard
          key={refreshKey}
          pilotLoggingEnabled={pilotLoggingEnabled}
          policy={policy}
        />
      </div>
    </section>
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
