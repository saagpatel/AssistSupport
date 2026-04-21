import type {
  ResponseQualityDrilldownExamples,
  ResponseQualitySummary,
} from "../../hooks/useAnalytics";
import type { ResponseQualityThresholds } from "../../features/analytics/qualityThresholds";
import { buildResponseQualityCoaching } from "../../features/analytics/qualityCoaching";
import { buildOperatorScorecard } from "../../features/analytics/operatorScorecard";
import { loadQueueHandoffSnapshot } from "../../features/inbox/queueModel";
import { QualityDrilldownExamples } from "./QualityDrilldownExamples";

export function ResponseQualityPanel({
  summary,
  thresholds,
  drilldown,
}: {
  summary: ResponseQualitySummary | null;
  thresholds: ResponseQualityThresholds;
  drilldown: ResponseQualityDrilldownExamples | null;
}) {
  if (!summary || summary.snapshots_count === 0) {
    return (
      <div className="response-quality-panel">
        <div className="section-title">Response Quality Signals</div>
        <div className="analytics-empty">
          <div className="analytics-empty-description">
            No response quality snapshots captured yet
          </div>
        </div>
      </div>
    );
  }

  const avgTimeSeconds =
    summary.avg_time_to_draft_ms != null
      ? (summary.avg_time_to_draft_ms / 1000).toFixed(1)
      : "--";
  const medianTimeSeconds =
    summary.median_time_to_draft_ms != null
      ? (summary.median_time_to_draft_ms / 1000).toFixed(1)
      : "--";
  const coaching = buildResponseQualityCoaching(summary, thresholds);
  const scorecard = buildOperatorScorecard(
    coaching,
    loadQueueHandoffSnapshot(),
  );

  return (
    <div className="response-quality-panel">
      <div className="response-quality-header">
        <div className="section-title">Response Quality Signals</div>
        {coaching && (
          <span
            className={`quality-severity-badge severity-${coaching.overallSeverity}`}
          >
            {coaching.overallSeverity === "healthy" && "Healthy"}
            {coaching.overallSeverity === "watch" && "Watch"}
            {coaching.overallSeverity === "action" && "Action"}
          </span>
        )}
      </div>
      <div className="response-quality-grid">
        <div className="response-quality-card">
          <span className="response-quality-label">Snapshots</span>
          <strong className="response-quality-value">
            {summary.snapshots_count}
          </strong>
        </div>
        <div className="response-quality-card">
          <span className="response-quality-label">Avg Words</span>
          <strong className="response-quality-value">
            {Math.round(summary.avg_word_count)}
          </strong>
        </div>
        <div className="response-quality-card">
          <span className="response-quality-label">Avg Edit Ratio</span>
          <strong className="response-quality-value">
            {(summary.avg_edit_ratio * 100).toFixed(1)}%
          </strong>
        </div>
        <div className="response-quality-card">
          <span className="response-quality-label">Edited Save Rate</span>
          <strong className="response-quality-value">
            {(summary.edited_save_rate * 100).toFixed(1)}%
          </strong>
        </div>
        <div className="response-quality-card">
          <span className="response-quality-label">Avg Time to Draft</span>
          <strong className="response-quality-value">{avgTimeSeconds}s</strong>
        </div>
        <div className="response-quality-card">
          <span className="response-quality-label">Median Time to Draft</span>
          <strong className="response-quality-value">
            {medianTimeSeconds}s
          </strong>
        </div>
        <div className="response-quality-card">
          <span className="response-quality-label">Copy per Save</span>
          <strong className="response-quality-value">
            {(summary.copy_per_saved_ratio * 100).toFixed(1)}%
          </strong>
        </div>
        <div className="response-quality-card">
          <span className="response-quality-label">Save Events</span>
          <strong className="response-quality-value">
            {summary.saved_count}
          </strong>
        </div>
      </div>
      {scorecard && (
        <div
          className={`operator-scorecard operator-scorecard-${scorecard.posture}`}
        >
          <div className="operator-scorecard-header">
            <div>
              <div className="operator-scorecard-title">Operator Scorecard</div>
              <p>{scorecard.summary}</p>
            </div>
            <div className="operator-scorecard-score">
              <strong>{scorecard.score}</strong>
              <span>/100</span>
            </div>
          </div>
          {scorecard.prioritySignals.length > 0 ? (
            <ul className="operator-scorecard-actions">
              {scorecard.prioritySignals.map((signal) => (
                <li key={`score-${signal.id}`}>
                  <strong>{signal.label}:</strong> {signal.guidance}
                </li>
              ))}
            </ul>
          ) : (
            <div className="operator-scorecard-actions-empty">
              No urgent actions this period. Keep current runbooks and monitor
              trend drift.
            </div>
          )}
        </div>
      )}
      {coaching && (
        <div className="response-quality-coaching">
          <div className="response-quality-coaching-title">
            Coaching thresholds
          </div>
          <ul className="response-quality-coaching-list">
            {coaching.signals.map((signal) => (
              <li
                key={signal.id}
                className={`response-quality-coaching-item severity-${signal.severity}`}
              >
                <div className="response-quality-coaching-item-head">
                  <strong>{signal.label}</strong>
                  <span>{signal.value}</span>
                </div>
                <p>{signal.guidance}</p>
                <p className="response-quality-coaching-hint">
                  {signal.drilldownHint}
                </p>
                <small>{signal.threshold}</small>
                {signal.severity !== "healthy" && (
                  <QualityDrilldownExamples
                    signalId={signal.id}
                    drilldown={drilldown}
                  />
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
