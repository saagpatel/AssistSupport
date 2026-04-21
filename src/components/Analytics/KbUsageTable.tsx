import type { ArticleUsage } from "../../hooks/useAnalytics";

export function KbUsageTable({
  articles,
  onArticleClick,
}: {
  articles: ArticleUsage[];
  onArticleClick?: (id: string) => void;
}) {
  if (articles.length === 0) {
    return (
      <div className="kb-usage-table">
        <div className="kb-usage-header">
          <div>Article</div>
          <div style={{ textAlign: "right" }}>Uses</div>
        </div>
        <div className="analytics-empty">
          <div className="analytics-empty-description">
            No article usage data yet
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="kb-usage-table">
      <div className="kb-usage-header">
        <div>Article</div>
        <div style={{ textAlign: "right" }}>Uses</div>
      </div>
      {articles.map((article) => (
        <div
          key={article.document_id}
          className={`kb-usage-row ${onArticleClick ? "kb-usage-row-clickable" : ""}`}
          onClick={() => onArticleClick?.(article.document_id)}
          role={onArticleClick ? "button" : undefined}
          tabIndex={onArticleClick ? 0 : undefined}
        >
          <div className="kb-usage-title" title={article.title}>
            {article.title}
          </div>
          <div className="kb-usage-count">{article.usage_count}</div>
        </div>
      ))}
    </div>
  );
}
