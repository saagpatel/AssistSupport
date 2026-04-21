const CONTEXT_WINDOW_OPTIONS = [
  { value: null, label: "Model Default" },
  { value: 2048, label: "2K (2,048 tokens)" },
  { value: 4096, label: "4K (4,096 tokens)" },
  { value: 8192, label: "8K (8,192 tokens)" },
  { value: 16384, label: "16K (16,384 tokens)" },
  { value: 32768, label: "32K (32,768 tokens)" },
];

interface ContextWindowSectionProps {
  loadedModel: string | null;
  contextWindowSize: number | null;
  onContextWindowChange: (value: string) => void;
}

export function ContextWindowSection({
  loadedModel,
  contextWindowSize,
  onContextWindowChange,
}: ContextWindowSectionProps) {
  return (
    <section className="settings-section">
      <h2>Context Window</h2>
      <p className="settings-description">
        Configure the maximum context length for LLM generation. Larger values
        allow more content but use more memory.
      </p>
      <div className="context-window-config">
        <select
          className="context-window-select"
          aria-label="Context window size"
          value={contextWindowSize ?? ""}
          onChange={(e) => onContextWindowChange(e.target.value)}
          disabled={!loadedModel}
        >
          {CONTEXT_WINDOW_OPTIONS.map((opt) => (
            <option key={opt.value ?? "default"} value={opt.value ?? ""}>
              {opt.label}
            </option>
          ))}
        </select>
        {!loadedModel && (
          <p className="setting-note">
            Load a model to configure context window.
          </p>
        )}
        <p className="setting-note">
          Higher values require more RAM. The "Model Default" option uses the
          model's training context (capped at 8K).
        </p>
      </div>
    </section>
  );
}
