import type { ResponseQualityDrilldownExamples as Drilldown } from "../../hooks/useAnalytics";

export type QualityDrilldownSignalId =
  | "edit_ratio"
  | "time_to_draft"
  | "copy_per_save"
  | "edited_save_rate";

export function formatDrilldownMetric(
  signalId: QualityDrilldownSignalId,
  metricValue: number,
): string {
  switch (signalId) {
    case "edit_ratio":
      return `${(metricValue * 100).toFixed(1)}% edit ratio`;
    case "time_to_draft":
      return `${(metricValue / 1000).toFixed(1)}s to draft`;
    case "copy_per_save":
      return "Saved without copy";
    case "edited_save_rate":
      return `${(metricValue * 100).toFixed(1)}% edit ratio`;
    default:
      return String(metricValue);
  }
}

export function QualityDrilldownExamples({
  signalId,
  drilldown,
}: {
  signalId: QualityDrilldownSignalId;
  drilldown: Drilldown | null;
}) {
  if (!drilldown) {
    return null;
  }
  const sourceItems = Array.isArray(drilldown[signalId])
    ? drilldown[signalId]
    : [];
  const items = sourceItems.slice(0, 3);
  if (items.length === 0) {
    return (
      <div className="quality-drilldown-empty">
        No matching draft examples captured yet for this period.
      </div>
    );
  }

  return (
    <div className="quality-drilldown">
      <div className="quality-drilldown-title">Draft examples to review</div>
      <ul className="quality-drilldown-list">
        {items.map((item) => (
          <li key={`${signalId}-${item.draft_id}-${item.created_at}`}>
            <div className="quality-drilldown-head">
              <code>{item.draft_id}</code>
              <span>{formatDrilldownMetric(signalId, item.metric_value)}</span>
            </div>
            {item.draft_excerpt && <p>{item.draft_excerpt}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
