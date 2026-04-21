import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "../shared/Button";
import { RatingPanel } from "./RatingPanel";
import { JiraPostPanel } from "./JiraPostPanel";
import { useToastContext } from "../../contexts/ToastContext";
import type {
  ConfidenceAssessment,
  GenerationMetrics,
  GroundedClaim,
} from "../../types/llm";
import type { ContextSource, DocumentChunk } from "../../types/knowledge";
import {
  parseResponseSections,
  getModeLabel,
  getConfidenceLevel,
  getSearchMethodLabel,
  getSourceTypeLabel,
  getScoreBarClassName,
} from "./responsePanelHelpers";
import { useResponsePanelCopy } from "./useResponsePanelCopy";
import "./ResponsePanel.css";

type ResponseSection = "output" | "instructions";

interface ResponsePanelProps {
  response: string;
  streamingText: string;
  isStreaming: boolean;
  sources: ContextSource[];
  generating: boolean;
  metrics: GenerationMetrics | null;
  confidence?: ConfidenceAssessment | null;
  grounding?: GroundedClaim[];
  draftId?: string | null;
  onSaveDraft?: () => void;
  onCancel?: () => void;
  hasInput?: boolean;
  onResponseChange?: (text: string) => void;
  isEdited?: boolean;
  modelName?: string | null;
  onGenerateAlternative?: () => void;
  generatingAlternative?: boolean;
  ticketKey?: string | null;
  onSaveAsTemplate?: (rating: number) => void;
}

export function ResponsePanel({
  response,
  streamingText,
  isStreaming,
  sources,
  generating,
  metrics,
  confidence,
  grounding = [],
  draftId,
  onSaveDraft,
  onCancel,
  hasInput,
  onResponseChange,
  isEdited,
  modelName,
  onGenerateAlternative,
  generatingAlternative,
  ticketKey,
  onSaveAsTemplate,
}: ResponsePanelProps) {
  const [showSources, setShowSources] = useState(false);
  const [expandedSourceId, setExpandedSourceId] = useState<string | null>(null);
  const [sourcePreviewContent, setSourcePreviewContent] = useState<
    Record<string, string>
  >({});
  const [sourcePreviewLoading, setSourcePreviewLoading] = useState<
    Record<string, boolean>
  >({});
  const [activeSection, setActiveSection] = useState<ResponseSection>("output");
  const { success: showSuccess, error: showError } = useToastContext();
  const prevResponseRef = useRef<string>("");

  const parsed = useMemo(() => parseResponseSections(response), [response]);

  const {
    copied,
    showCopyOverride,
    copyOverrideReason,
    copyOverrideSubmitting,
    showExportMenu,
    exportMenuRef,
    setCopyOverrideReason,
    setShowExportMenu,
    handleCopy,
    handleConfirmCopyOverride,
    handleExport,
    cancelCopyOverride,
  } = useResponsePanelCopy({
    response,
    parsed,
    confidenceMode: confidence?.mode,
    sourcesCount: sources.length,
    showSuccess,
    showError,
  });

  useEffect(() => {
    if (
      response &&
      response !== prevResponseRef.current &&
      sources.length > 0 &&
      !generating &&
      !isStreaming
    ) {
      setShowSources(true);
    }
    prevResponseRef.current = response;
  }, [response, sources.length, generating, isStreaming]);

  const handleSourceToggle = useCallback(
    async (source: ContextSource) => {
      const chunkId = source.chunk_id;

      if (expandedSourceId === chunkId) {
        setExpandedSourceId(null);
        return;
      }

      setExpandedSourceId(chunkId);

      // Fetch preview content if not already cached
      if (!sourcePreviewContent[chunkId]) {
        setSourcePreviewLoading((prev) => ({ ...prev, [chunkId]: true }));
        try {
          const chunks = await invoke<DocumentChunk[]>("get_document_chunks", {
            documentId: source.document_id,
          });
          // Find the matching chunk by id, or fall back to first chunk
          const matchingChunk =
            chunks.find((c) => c.id === chunkId) ?? chunks[0];
          const content = matchingChunk?.content ?? "No content available.";
          setSourcePreviewContent((prev) => ({ ...prev, [chunkId]: content }));
        } catch {
          setSourcePreviewContent((prev) => ({
            ...prev,
            [chunkId]: "Failed to load content preview.",
          }));
        } finally {
          setSourcePreviewLoading((prev) => ({ ...prev, [chunkId]: false }));
        }
      }
    },
    [expandedSourceId, sourcePreviewContent],
  );

  const outputText = parsed.hasSections ? parsed.output : response;
  const wordCount = outputText.trim().split(/\s+/).filter(Boolean).length;

  // Compute average confidence from sources
  const avgScore =
    sources.length > 0
      ? sources.reduce((sum, s) => sum + s.score, 0) / sources.length
      : 0;
  const sourceConfidence =
    sources.length > 0 ? getConfidenceLevel(avgScore) : null;

  return (
    <>
      {showCopyOverride && (
        <div
          className="copy-override-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Copy override"
        >
          <div className="copy-override-card">
            <h3>Copy override required</h3>
            <p>
              This response is not eligible for copy because it is missing
              citations or is not in <strong>answer</strong> mode. You can still
              copy, but the app will log an audit entry locally (no response
              text is logged).
            </p>
            <label className="copy-override-label">
              Reason (required)
              <textarea
                value={copyOverrideReason}
                onChange={(e) => setCopyOverrideReason(e.target.value)}
                placeholder="Explain why copying without citations is acceptable here."
                rows={3}
              />
            </label>
            <div className="copy-override-actions">
              <Button
                variant="secondary"
                size="small"
                onClick={cancelCopyOverride}
                disabled={copyOverrideSubmitting}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="small"
                onClick={handleConfirmCopyOverride}
                disabled={copyOverrideSubmitting}
              >
                {copyOverrideSubmitting ? "Copying..." : "Copy with override"}
              </Button>
            </div>
          </div>
        </div>
      )}
      <div className="panel-header">
        <h3>Response</h3>
        <div className="response-actions">
          {onGenerateAlternative && response && !generating && !isStreaming && (
            <Button
              variant="ghost"
              size="small"
              onClick={onGenerateAlternative}
              disabled={generatingAlternative}
              className="btn-hover-scale"
            >
              {generatingAlternative ? "Generating..." : "Generate Alternative"}
            </Button>
          )}
          {sources.length > 0 && (
            <Button
              variant="ghost"
              size="small"
              onClick={() => setShowSources(!showSources)}
            >
              {showSources ? "Hide Sources" : `Sources (${sources.length})`}
            </Button>
          )}
          {onSaveDraft && (
            <Button
              variant="ghost"
              size="small"
              onClick={onSaveDraft}
              disabled={!hasInput}
            >
              Save Draft
            </Button>
          )}
          <Button
            variant="secondary"
            size="small"
            onClick={handleCopy}
            disabled={!response}
          >
            {copied ? "Copied!" : "Copy"}
          </Button>
          <div className="export-dropdown-wrapper" ref={exportMenuRef}>
            <Button
              variant="secondary"
              size="small"
              onClick={() => setShowExportMenu(!showExportMenu)}
              disabled={!response}
            >
              Export ▾
            </Button>
            {showExportMenu && (
              <div className="export-dropdown-menu">
                <button
                  className="export-option"
                  onClick={() => handleExport("Markdown")}
                >
                  Markdown (.md)
                </button>
                <button
                  className="export-option"
                  onClick={() => handleExport("PlainText")}
                >
                  Plain Text (.txt)
                </button>
                <button
                  className="export-option"
                  onClick={() => handleExport("Html")}
                >
                  HTML (.html)
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div
        className="panel-content response-content"
        tabIndex={0}
        aria-label="Generated response panel"
      >
        {generating && !streamingText ? (
          <div className="generating-indicator">
            <div className="generating-spinner" />
            <span>Generating response...</span>
            {onCancel && (
              <Button variant="ghost" size="small" onClick={onCancel}>
                Cancel
              </Button>
            )}
          </div>
        ) : isStreaming || streamingText ? (
          <>
            <div className="response-text">
              {streamingText}
              {isStreaming && <span className="streaming-cursor">|</span>}
            </div>
            {isStreaming && onCancel && (
              <div className="streaming-actions">
                <Button variant="ghost" size="small" onClick={onCancel}>
                  Cancel
                </Button>
              </div>
            )}
          </>
        ) : response ? (
          <>
            {confidence && (
              <div
                className={`confidence-gate confidence-gate-${confidence.mode}`}
              >
                <div className="confidence-gate-main">
                  <strong>{getModeLabel(confidence.mode)}</strong>
                  <span>{Math.round(confidence.score * 100)}% confidence</span>
                </div>
                <div className="confidence-gate-rationale">
                  {confidence.rationale}
                </div>
              </div>
            )}

            {parsed.hasSections && (
              <div className="response-section-tabs">
                <button
                  className={`response-section-tab${activeSection === "output" ? " active" : ""}`}
                  onClick={() => setActiveSection("output")}
                >
                  Output
                  <span className="section-tab-hint">Copy &amp; Send</span>
                </button>
                <button
                  className={`response-section-tab${activeSection === "instructions" ? " active" : ""}`}
                  onClick={() => setActiveSection("instructions")}
                >
                  IT Support Instructions
                </button>
              </div>
            )}

            {(!parsed.hasSections || activeSection === "output") && (
              <textarea
                className="response-textarea"
                value={parsed.hasSections ? parsed.output : response}
                onChange={(e) => {
                  if (!parsed.hasSections) {
                    onResponseChange?.(e.target.value);
                  } else {
                    // Reconstruct full response with edited output
                    const newFull = `### OUTPUT\n${e.target.value}\n\n### IT SUPPORT INSTRUCTIONS\n${parsed.instructions}`;
                    onResponseChange?.(newFull);
                  }
                }}
                placeholder="Response will appear here..."
                readOnly={!onResponseChange}
              />
            )}

            {parsed.hasSections && activeSection === "instructions" && (
              <div className="instructions-content">{parsed.instructions}</div>
            )}

            {showSources && sources.length > 0 && (
              <div className="sources-panel">
                <div className="sources-panel-header">
                  <h4>Knowledge Base Sources</h4>
                  {sourceConfidence && (
                    <div className="confidence-group">
                      <span
                        className={`confidence-badge ${sourceConfidence.className}`}
                      >
                        {sourceConfidence.label}
                      </span>
                      <span className="confidence-explanation">
                        {sourceConfidence.explanation}
                      </span>
                    </div>
                  )}
                </div>
                {avgScore < 0.5 && avgScore > 0 && (
                  <div className="low-confidence-warning">
                    Low source confidence — response may need manual
                    verification
                  </div>
                )}

                {grounding.length > 0 && (
                  <div className="grounding-panel">
                    <h5>Source Grounding</h5>
                    <ul className="grounding-list">
                      {grounding.slice(0, 8).map((item, idx) => (
                        <li
                          key={`${idx}-${item.claim.slice(0, 24)}`}
                          className={`grounding-item grounding-${item.support_level}`}
                        >
                          <span className="grounding-claim">{item.claim}</span>
                          <span className="grounding-meta">
                            {item.source_indexes.length > 0
                              ? `Sources: ${item.source_indexes.map((i) => i + 1).join(", ")}`
                              : "No citation"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <ul className="sources-list">
                  {sources.map((source, i) => {
                    const isExpanded = expandedSourceId === source.chunk_id;
                    const isLoading =
                      sourcePreviewLoading[source.chunk_id] ?? false;
                    const preview = sourcePreviewContent[source.chunk_id];
                    const scorePct = (source.score * 100).toFixed(0);

                    return (
                      <li
                        key={source.chunk_id}
                        className="source-item-expandable"
                      >
                        <button
                          className="source-expand-toggle"
                          onClick={() => handleSourceToggle(source)}
                          aria-expanded={isExpanded}
                          title={
                            isExpanded ? "Collapse preview" : "Expand preview"
                          }
                        >
                          <span className="source-expand-icon">
                            {isExpanded ? "\u25BE" : "\u25B8"}
                          </span>
                          <span className="source-number">[{i + 1}]</span>
                          <div className="source-info">
                            <span className="source-title">
                              {source.title || source.file_path}
                            </span>
                            {source.heading_path && (
                              <span className="source-heading">
                                &rsaquo; {source.heading_path}
                              </span>
                            )}
                          </div>
                          <div className="source-badges">
                            {source.search_method && (
                              <span className="search-method-badge">
                                {getSearchMethodLabel(source.search_method)}
                              </span>
                            )}
                            {source.source_type && (
                              <span className="source-type-badge">
                                {getSourceTypeLabel(source.source_type)}
                              </span>
                            )}
                          </div>
                          <div
                            className="source-score-bar"
                            title={`Relevance: ${scorePct}%`}
                          >
                            <div className="source-score-bar-track">
                              <div
                                className={`source-score-bar-fill ${getScoreBarClassName(source.score)}`}
                                style={{ width: `${scorePct}%` }}
                              />
                            </div>
                            <span className="source-score-label">
                              {scorePct}%
                            </span>
                          </div>
                        </button>
                        {isExpanded && (
                          <div className="source-preview">
                            {isLoading ? (
                              <div className="source-preview-loading">
                                Loading preview...
                              </div>
                            ) : (
                              <pre className="source-preview-content">
                                {preview}
                              </pre>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {metrics && (
                  <div className="sources-metrics">
                    <span
                      className="metrics-item"
                      title="Tokens generated per second"
                    >
                      {metrics.tokens_per_second.toFixed(1)} tok/s
                    </span>
                    <span
                      className="metrics-item"
                      title="Number of KB sources used"
                    >
                      {metrics.sources_used} sources
                    </span>
                    <span
                      className="metrics-item"
                      title="Context window utilization"
                    >
                      {(metrics.context_utilization * 100).toFixed(0)}% ctx
                    </span>
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="response-placeholder">
            Generated response will appear here...
          </div>
        )}

        {response && (
          <div className="response-footer">
            <div className="response-footer-left">
              <span className="word-count">{wordCount} words</span>
              {isEdited && <span className="edited-indicator">(edited)</span>}
            </div>
            {modelName && (
              <div className="response-footer-right">
                <span
                  className="model-info"
                  title={`Generated by ${modelName}`}
                >
                  {modelName}
                </span>
              </div>
            )}
          </div>
        )}

        {response && !generating && !isStreaming && (
          <>
            <RatingPanel
              draftId={draftId ?? null}
              onSaveAsTemplate={onSaveAsTemplate}
            />
            {ticketKey && (
              <JiraPostPanel
                ticketKey={ticketKey}
                responseText={response}
                draftId={draftId ?? null}
              />
            )}
          </>
        )}
      </div>
    </>
  );
}
