interface AdvancedSearchSectionProps {
  vectorEnabled: boolean;
  onVectorToggle: () => void;
}

export function AdvancedSearchSection({
  vectorEnabled,
  onVectorToggle,
}: AdvancedSearchSectionProps) {
  return (
    <section className="settings-section">
      <h2>Advanced Search</h2>
      <p className="settings-description">
        Enable AI-powered semantic search for better knowledge base results.
      </p>
      <div className="vector-consent">
        <label className="toggle-label">
          <input
            type="checkbox"
            checked={vectorEnabled}
            onChange={onVectorToggle}
          />
          <span className="toggle-text">Enable vector embeddings</span>
        </label>
        <p className="setting-note">
          Creates embeddings of your documents for semantic search. All
          processing happens locally on your machine.
        </p>
      </div>
    </section>
  );
}
