import { Button } from "../../shared/Button";

interface KbSectionProps {
  kbFolder: string | null;
  indexStats: { total_chunks: number; total_files: number } | null;
  loading: string | null;
  onSelectKbFolder: () => void;
  onRebuildIndex: () => void;
}

export function KbSection({
  kbFolder,
  indexStats,
  loading,
  onSelectKbFolder,
  onRebuildIndex,
}: KbSectionProps) {
  return (
    <section className="settings-section">
      <h2>Knowledge Base</h2>
      <p className="settings-description">
        Configure the folder containing your knowledge base documents.
      </p>

      <div className="kb-config">
        <div className="kb-folder-row">
          <div className="kb-folder-display">
            {kbFolder ? (
              <code>{kbFolder}</code>
            ) : (
              <span className="kb-placeholder">No folder selected</span>
            )}
          </div>
          <Button variant="secondary" onClick={onSelectKbFolder}>
            {kbFolder ? "Change" : "Select Folder"}
          </Button>
        </div>

        {kbFolder && (
          <div className="kb-stats">
            <div className="stat-item">
              <span className="stat-label">Files indexed</span>
              <span className="stat-value">
                {indexStats?.total_files ?? "—"}
              </span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Total chunks</span>
              <span className="stat-value">
                {indexStats?.total_chunks ?? "—"}
              </span>
            </div>
            <Button
              variant="ghost"
              size="small"
              onClick={onRebuildIndex}
              disabled={loading === "rebuild"}
            >
              {loading === "rebuild" ? "Rebuilding..." : "Rebuild Index"}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
