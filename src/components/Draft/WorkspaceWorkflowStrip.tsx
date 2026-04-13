import { Button } from "../shared/Button";

interface WorkspaceWorkflowStripProps {
  inputWordCount: number;
  currentTicketId: string | null;
  treeCompleted: boolean;
  checklistCompletedCount: number;
  checklistItemCount: number;
  responseWordCount: number;
  isResponseEdited: boolean;
  responseEditRatio: number;
  hasResponseReady: boolean;
  handoffTouched: boolean;
  panelDensityMode: "balanced" | "focus-intake" | "focus-response";
  modelLoaded: boolean;
  firstResponseGenerating: boolean;
  checklistGenerating: boolean;
  generating: boolean;
  hasInput: boolean;
  hasChecklistInput: boolean;
  onPanelDensityModeChange: (
    mode: "balanced" | "focus-intake" | "focus-response",
  ) => void;
  onGenerateFirstResponse: () => void;
  onChecklistGenerate: () => void;
  onGenerate: () => void;
  onSaveDraft: () => void;
}

export function WorkspaceWorkflowStrip({
  inputWordCount,
  currentTicketId,
  treeCompleted,
  checklistCompletedCount,
  checklistItemCount,
  responseWordCount,
  isResponseEdited,
  responseEditRatio,
  hasResponseReady,
  handoffTouched,
  panelDensityMode,
  modelLoaded,
  firstResponseGenerating,
  checklistGenerating,
  generating,
  hasInput,
  hasChecklistInput,
  onPanelDensityModeChange,
  onGenerateFirstResponse,
  onChecklistGenerate,
  onGenerate,
  onSaveDraft,
}: WorkspaceWorkflowStripProps) {
  return (
    <section
      className="draft-workflow-strip"
      aria-label="Draft workflow overview"
    >
      <div className="draft-workflow-step">
        <h4>1. Intake</h4>
        <p>
          {inputWordCount} words captured{" "}
          {currentTicketId ? "· ticket linked" : "· no ticket linked"}
        </p>
      </div>
      <div className="draft-workflow-step">
        <h4>2. Diagnose</h4>
        <p>
          {treeCompleted ? "Tree completed" : "Tree not run"}
          {" · "}
          checklist {checklistCompletedCount}/{checklistItemCount}
        </p>
      </div>
      <div className="draft-workflow-step">
        <h4>3. Draft</h4>
        <p>
          {responseWordCount} words
          {isResponseEdited
            ? ` · edited (${Math.round(responseEditRatio * 100)}%)`
            : " · unedited"}
        </p>
      </div>
      <div className="draft-workflow-step">
        <h4>4. Handoff</h4>
        <p>
          {hasResponseReady
            ? handoffTouched
              ? "Copied/exported"
              : "Ready to copy/export"
            : "No response yet"}
        </p>
      </div>
      <div className="draft-workflow-actions">
        <div
          className="draft-layout-mode-toggle"
          role="group"
          aria-label="Draft panel layout"
        >
          <button
            type="button"
            className={`draft-layout-mode-btn ${panelDensityMode === "balanced" ? "active" : ""}`}
            onClick={() => onPanelDensityModeChange("balanced")}
          >
            Balanced
          </button>
          <button
            type="button"
            className={`draft-layout-mode-btn ${panelDensityMode === "focus-intake" ? "active" : ""}`}
            onClick={() => onPanelDensityModeChange("focus-intake")}
          >
            Intake Focus
          </button>
          <button
            type="button"
            className={`draft-layout-mode-btn ${panelDensityMode === "focus-response" ? "active" : ""}`}
            onClick={() => onPanelDensityModeChange("focus-response")}
          >
            Response Focus
          </button>
        </div>
        <Button
          size="small"
          variant="secondary"
          onClick={onGenerateFirstResponse}
          disabled={!modelLoaded || firstResponseGenerating || !hasInput}
        >
          Draft First Reply
        </Button>
        <Button
          size="small"
          variant="ghost"
          onClick={onChecklistGenerate}
          disabled={!modelLoaded || checklistGenerating || !hasChecklistInput}
        >
          Build Checklist
        </Button>
        <Button
          size="small"
          variant="primary"
          onClick={onGenerate}
          disabled={!modelLoaded || generating || !hasInput}
          title="Generate response (Cmd+G in input)"
          aria-keyshortcuts="Meta+G"
        >
          Generate Full Response
        </Button>
        <Button
          size="small"
          variant="ghost"
          onClick={onSaveDraft}
          disabled={!hasInput}
        >
          Save
        </Button>
        <div
          className="draft-workflow-shortcuts"
          aria-label="Keyboard shortcuts"
        >
          <span>
            <kbd>Cmd</kbd>+<kbd>G</kbd> Generate
          </span>
          <span>
            <kbd>Cmd</kbd>+<kbd>N</kbd> Clear
          </span>
          <span>
            <kbd>Cmd</kbd>+<kbd>1</kbd>/<kbd>2</kbd>/<kbd>3</kbd> Layout
          </span>
        </div>
      </div>
    </section>
  );
}
