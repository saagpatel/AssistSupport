/**
 * Claude Design Workspace — the Draft flow rendered in the layout of
 * the Claude Design handoff bundle (assistsupport/project/AssistSupport Workspace.html).
 *
 * This component is a pure renderer: it consumes state + handlers from
 * the existing DraftTab hooks and emits JSX/classnames matching the
 * handoff's `.ws`, `.ticket`, `.ws-strip`, `.panel`, `.chip`, `.seg`,
 * `.gauge`, `.intent`, `.sources`, `.alternatives` styles defined in
 * `src/styles/revamp/claudeDesignWorkspace.css`.
 */

import { useMemo } from "react";
import type { ReactNode } from "react";
import { Icon } from "../../components/shared/Icon";
import type {
  ConfidenceAssessment,
  GenerationMetrics,
  GroundedClaim,
} from "../../types/llm";
import type { ContextSource } from "../../types/knowledge";
import type {
  CaseIntake,
  IntakeUrgency,
  NoteAudience,
  ResponseAlternative,
  ResponseLength,
} from "../../types/workspace";
import type { JiraTicket } from "../../hooks/useJira";

export interface ClaudeDesignWorkspaceProps {
  // Ticket
  ticket: JiraTicket | null;
  ticketId: string | null;

  // Input
  input: string;
  onInputChange: (value: string) => void;
  responseLength: ResponseLength;
  onResponseLengthChange: (length: ResponseLength) => void;

  // Workflow status
  hasInput: boolean;
  hasDiagnosis: boolean;
  hasResponseReady: boolean;
  handoffTouched: boolean;

  // Response
  response: string;
  streamingText: string;
  isStreaming: boolean;
  sources: ContextSource[];
  metrics: GenerationMetrics | null;
  confidence: ConfidenceAssessment | null;
  grounding: GroundedClaim[];
  alternatives: ResponseAlternative[];

  // State
  generating: boolean;
  modelLoaded: boolean;
  loadedModelName: string | null;

  // Intake
  caseIntake: CaseIntake;
  onIntakeFieldChange: (
    field: "note_audience" | "likely_category" | "urgency" | "environment",
    value: string | null,
  ) => void;

  // Actions
  onGenerate: () => void;
  onCancel: () => void;
  onCopyResponse: () => void;
  onSaveAsTemplate: () => void;
  onUseAlternative: (alt: ResponseAlternative) => void;
  onNavigateToSource?: (searchQuery: string) => void;
}

const INTENT_CHIPS: ReadonlyArray<{
  value: string;
  label: string;
}> = [
  { value: "policy", label: "Policy" },
  { value: "howto", label: "Howto" },
  { value: "access", label: "Access" },
  { value: "incident", label: "Incident" },
];

const LENGTH_OPTIONS: ReadonlyArray<ResponseLength> = [
  "Short",
  "Medium",
  "Long",
];

const URGENCY_OPTIONS: ReadonlyArray<IntakeUrgency | ""> = [
  "",
  "low",
  "normal",
  "high",
  "critical",
];

const AUDIENCE_OPTIONS: ReadonlyArray<{ value: NoteAudience; label: string }> =
  [
    { value: "customer-safe", label: "End user (customer-safe)" },
    { value: "internal-note", label: "Internal note" },
    { value: "escalation-note", label: "Escalation note" },
  ];

const TONE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "neutral", label: "Neutral" },
  { value: "empathetic", label: "Empathetic" },
  { value: "direct", label: "Direct" },
];

/**
 * Derive initials for the ticket avatar — "Priya Anand" -> "PA".
 */
function initialsFor(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

/**
 * Format a timestamp like "2h ago" from an ISO string.
 * Falls back to the raw string if parsing fails.
 */
function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const seconds = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

/**
 * Derive a lowercase, underscored intent class for the banner from
 * the free-text likely_category that the intake analyzer produced.
 * e.g. "Policy / removable media" -> "policy_removable_media".
 */
function deriveIntentClass(category: string | null | undefined): string | null {
  if (!category) return null;
  const slug = category
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || null;
}

/**
 * Render response text with inline [n] citations as accent cite pills.
 * Falls back to plain text when no citation markers are found.
 */
function renderResponseWithCitations(
  text: string,
  sources: ContextSource[],
  onNavigateToSource: ((searchQuery: string) => void) | undefined,
): ReactNode[] {
  if (!text) return [];
  const parts: ReactNode[] = [];
  const re = /\[(\d+)\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyIdx = 0;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const n = Number.parseInt(match[1] ?? "0", 10);
    const source = n > 0 ? sources[n - 1] : undefined;
    const title = source?.title ?? source?.file_path ?? `Source ${n}`;
    const searchQuery = source?.title ?? source?.file_path ?? "";
    parts.push(
      <button
        key={`cite-${keyIdx++}`}
        type="button"
        className="cite"
        title={title}
        onClick={() => {
          if (onNavigateToSource && searchQuery) {
            onNavigateToSource(searchQuery);
          }
        }}
      >
        {n}
      </button>,
    );
    lastIndex = re.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
}

function formatPercent(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "--";
  return `${Math.round(value * 100)}%`;
}

export function ClaudeDesignWorkspace({
  ticket,
  ticketId,
  input,
  onInputChange,
  responseLength,
  onResponseLengthChange,
  hasInput,
  hasDiagnosis,
  hasResponseReady,
  handoffTouched,
  response,
  streamingText,
  isStreaming,
  sources,
  metrics,
  confidence,
  grounding,
  alternatives,
  generating,
  modelLoaded,
  loadedModelName,
  caseIntake,
  onIntakeFieldChange,
  onGenerate,
  onCancel,
  onCopyResponse,
  onSaveAsTemplate,
  onUseAlternative,
  onNavigateToSource,
}: ClaudeDesignWorkspaceProps) {
  const displayedResponse = isStreaming ? streamingText : response;
  const hasResponse = Boolean(displayedResponse.trim());

  const activeIntent = useMemo(
    () => deriveIntentClass(caseIntake.likely_category),
    [caseIntake.likely_category],
  );

  const stages = useMemo(() => {
    // 4-step workflow: Triage -> Classify -> Draft -> Send
    const triageDone = hasInput;
    const classifyDone = hasDiagnosis || Boolean(activeIntent);
    const draftDone = hasResponseReady;
    const sendDone = handoffTouched;
    let activeIdx = 0;
    if (!triageDone) activeIdx = 0;
    else if (!classifyDone) activeIdx = 1;
    else if (!draftDone) activeIdx = 2;
    else activeIdx = 3;
    return [
      { n: 1, label: "Triage", done: triageDone },
      { n: 2, label: "Classify", done: classifyDone },
      { n: 3, label: "Draft response", done: draftDone },
      { n: 4, label: "Send to Jira", done: sendDone },
    ].map((s, i) => ({
      ...s,
      state: s.done ? "done" : i === activeIdx ? "active" : "",
    }));
  }, [hasInput, hasDiagnosis, activeIntent, hasResponseReady, handoffTouched]);

  const gaugePercent = confidence ? Math.round(confidence.score * 100) : null;
  const gaugeWidth = gaugePercent != null ? `${gaugePercent}%` : "0%";
  const confidenceTone = !confidence
    ? null
    : confidence.mode === "answer"
      ? "good"
      : confidence.mode === "clarify"
        ? "warn"
        : "bad";

  const groundedClaimCount = grounding.length;
  const supportedClaimCount = grounding.filter(
    (g: GroundedClaim) => g.support_level === "supported",
  ).length;

  const sourcesCount = sources.length;
  const wordCount = metrics?.word_count ?? 0;
  const tokensPerSec = metrics?.tokens_per_second ?? 0;
  const contextUtilPct =
    metrics?.context_utilization != null
      ? Math.round(metrics.context_utilization * 100)
      : null;

  const ticketPriority = ticket?.priority ?? "Normal";
  const ticketReporter = ticket?.reporter ?? "—";
  const ticketSummary = ticket?.summary ?? "No ticket loaded";
  const ticketKey = ticket?.key ?? ticketId;
  const ticketOpened = ticket?.created ? timeAgo(ticket.created) : "";
  const ticketIssueType = ticket?.issue_type ?? "Request";

  const intakeCategoryChip = (caseIntake.likely_category ?? "").toLowerCase();

  return (
    <div className="cdw">
      {/* ===== TICKET HEADER CARD ===== */}
      <div className="ticket">
        <div className="ticket__avatar">{initialsFor(ticketReporter)}</div>
        <div style={{ minWidth: 0 }}>
          <div className="ticket__id mono">
            {ticketKey
              ? `${ticketKey} · ${ticketIssueType.toUpperCase()}`
              : "NO TICKET LOADED"}
          </div>
          <div className="ticket__title">{ticketSummary}</div>
          <div className="ticket__meta">
            <span>
              <b>{ticketReporter}</b>
            </span>
            {ticket?.status && (
              <>
                <span>·</span>
                <span>{ticket.status}</span>
              </>
            )}
            {ticket?.assignee && (
              <>
                <span>·</span>
                <span>→ {ticket.assignee}</span>
              </>
            )}
            {ticketOpened && (
              <>
                <span>·</span>
                <span className="hstack" style={{ gap: 4 }}>
                  <Icon name="clock" size={11} /> {ticketOpened}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="ticket__right">
          <span className="badge">{ticketPriority}</span>
          {caseIntake.likely_category && (
            <span className="badge badge--warn">
              {caseIntake.likely_category}
            </span>
          )}
        </div>
      </div>

      {/* ===== WORKFLOW STRIP ===== */}
      <div className="ws-strip" role="list" aria-label="Workspace workflow">
        {stages.map((stage, i) => (
          <div key={stage.n} style={{ display: "contents" }} role="listitem">
            <div
              className={[
                "ws-stage",
                stage.state === "active" ? "is-active" : "",
                stage.state === "done" ? "is-done" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <div className="ws-stage__num">
                {stage.state === "done" ? (
                  <Icon name="check" size={11} />
                ) : (
                  stage.n
                )}
              </div>
              <span>{stage.label}</span>
            </div>
            {i < stages.length - 1 && <div className="ws-stage__connector" />}
          </div>
        ))}
      </div>

      {/* ===== TWO-COLUMN PANELS ===== */}
      <div className="ws-panels">
        {/* LEFT — Query + Context */}
        <div className="vstack" style={{ gap: 16 }}>
          {/* Query panel */}
          <div className="panel">
            <div className="panel__header">
              <div className="panel__titleBlock">
                <div className="panel__title">
                  <Icon name="edit" size={13} /> Query
                </div>
                <div className="panel__subtitle">
                  Paste the ticket or describe the issue
                </div>
              </div>
            </div>
            <div className="panel__body">
              <div className="input-area">
                <textarea
                  value={input}
                  onChange={(e) => onInputChange(e.target.value)}
                  placeholder="Paste the ticket or describe the issue…"
                  aria-label="Ticket or issue description"
                />
                <div
                  className="hstack"
                  style={{
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: 8,
                  }}
                >
                  <div
                    className="input-chips"
                    role="radiogroup"
                    aria-label="Intent"
                  >
                    {INTENT_CHIPS.map((c) => {
                      const isOn = intakeCategoryChip === c.value;
                      return (
                        <button
                          key={c.value}
                          type="button"
                          role="radio"
                          aria-checked={isOn}
                          className={["chip", isOn ? "is-on" : ""]
                            .filter(Boolean)
                            .join(" ")}
                          onClick={() =>
                            onIntakeFieldChange(
                              "likely_category",
                              isOn ? null : c.label,
                            )
                          }
                        >
                          <span className="chip__dot" aria-hidden="true" />
                          {c.label}
                        </button>
                      );
                    })}
                  </div>
                  <div
                    className="seg"
                    role="radiogroup"
                    aria-label="Response length"
                  >
                    {LENGTH_OPTIONS.map((l) => (
                      <button
                        key={l}
                        type="button"
                        role="radio"
                        aria-checked={responseLength === l}
                        className={responseLength === l ? "is-on" : ""}
                        onClick={() => onResponseLengthChange(l)}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Context panel */}
          <div className="panel">
            <div className="panel__header">
              <div className="panel__titleBlock">
                <div className="panel__title">
                  <Icon name="filter" size={13} /> Context
                </div>
                <div className="panel__subtitle">
                  Tune grounding for this response
                </div>
              </div>
            </div>
            <div className="panel__body">
              <div className="intake">
                <div className="intake__row">
                  <label htmlFor="cdw-audience">Audience</label>
                  <select
                    id="cdw-audience"
                    value={caseIntake.note_audience ?? "customer-safe"}
                    onChange={(e) =>
                      onIntakeFieldChange("note_audience", e.target.value)
                    }
                  >
                    {AUDIENCE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="intake__row">
                  <label htmlFor="cdw-tone">Tone</label>
                  <select id="cdw-tone" defaultValue="neutral">
                    {TONE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="intake__row">
                  <label htmlFor="cdw-urgency">Urgency</label>
                  <select
                    id="cdw-urgency"
                    value={caseIntake.urgency ?? ""}
                    onChange={(e) =>
                      onIntakeFieldChange("urgency", e.target.value || null)
                    }
                  >
                    {URGENCY_OPTIONS.map((u) => (
                      <option key={u || "auto"} value={u}>
                        {u ? u[0]!.toUpperCase() + u.slice(1) : "Auto"}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="intake__row">
                  <label htmlFor="cdw-env">Environment</label>
                  <input
                    id="cdw-env"
                    type="text"
                    placeholder="e.g. macOS 14, Okta SSO"
                    value={caseIntake.environment ?? ""}
                    onChange={(e) =>
                      onIntakeFieldChange("environment", e.target.value || null)
                    }
                  />
                </div>
              </div>
              <div
                className="hstack"
                style={{ justifyContent: "flex-end", marginTop: 4, gap: 6 }}
              >
                {generating ? (
                  <button
                    type="button"
                    className="btn btn--sm"
                    onClick={onCancel}
                  >
                    <Icon name="stop" size={12} /> Cancel
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn--primary"
                    onClick={onGenerate}
                    disabled={!modelLoaded || !input.trim()}
                    title={
                      !modelLoaded
                        ? "Model not loaded"
                        : !input.trim()
                          ? "Enter a query first"
                          : undefined
                    }
                  >
                    <Icon name="zap" size={12} /> Generate
                    <span className="btn__kbd">⌘↵</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT — Response / Sources / Alternatives */}
        <div className="vstack" style={{ gap: 16 }}>
          {hasResponse && (
            <div className="panel">
              {(activeIntent || caseIntake.likely_category) && (
                <div className="intent">
                  <span className="intent__label">ML Intent</span>
                  <span className="intent__class">
                    {(
                      caseIntake.likely_category ??
                      activeIntent ??
                      ""
                    ).toUpperCase()}
                    {activeIntent && caseIntake.likely_category
                      ? ` · ${activeIntent}`
                      : ""}
                  </span>
                  {confidence && (
                    <span className="intent__conf">
                      {formatPercent(confidence.score)} conf
                    </span>
                  )}
                </div>
              )}

              {confidence && (
                <div
                  className="gauge"
                  style={
                    confidenceTone === "bad"
                      ? {
                          background: "var(--as-bad-surface)",
                          borderBottom: "1px solid var(--as-bad-border)",
                        }
                      : confidenceTone === "warn"
                        ? {
                            background: "var(--as-warn-surface)",
                            borderBottom: "1px solid var(--as-warn-border)",
                          }
                        : undefined
                  }
                >
                  <span
                    className={[
                      "gauge__pill",
                      confidenceTone === "bad" ? "badge--bad" : "",
                      confidenceTone === "warn" ? "badge--warn" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <Icon name="shield" size={10} />
                    {confidence.mode === "answer"
                      ? "Grounded"
                      : confidence.mode === "clarify"
                        ? "Needs clarify"
                        : "Abstain"}
                  </span>
                  <div
                    className="gauge__bar"
                    style={{ ["--v" as string]: gaugeWidth }}
                    aria-label={`Confidence ${gaugePercent ?? "--"}%`}
                  />
                  <span className="gauge__num">
                    {gaugePercent != null ? `${gaugePercent}%` : "--"}
                  </span>
                </div>
              )}

              <div className="response-meta">
                <span className="response-meta__item">
                  <Icon name="zap" size={11} /> <b>{tokensPerSec.toFixed(0)}</b>{" "}
                  tok/s
                </span>
                <span className="response-meta__item">
                  <Icon name="book" size={11} /> <b>{sourcesCount}</b> sources
                </span>
                <span className="response-meta__item">
                  <Icon name="file-text" size={11} /> <b>{wordCount}</b> words
                </span>
                {contextUtilPct != null && (
                  <span className="response-meta__item">
                    <Icon name="database" size={11} /> <b>{contextUtilPct}%</b>{" "}
                    ctx
                  </span>
                )}
                {groundedClaimCount > 0 && (
                  <span className="response-meta__item">
                    <Icon name="check" size={11} />{" "}
                    <b>
                      {supportedClaimCount}/{groundedClaimCount}
                    </b>{" "}
                    claims supported
                  </span>
                )}
                <span className="response-meta__item mono muted">
                  {loadedModelName ?? "model unloaded"}
                </span>
              </div>

              <div className="response-body">
                {renderResponseWithCitations(
                  displayedResponse,
                  sources,
                  onNavigateToSource,
                )}
                {isStreaming && (
                  <span className="streaming-dot" aria-label="streaming" />
                )}
              </div>

              <div className="response-actions">
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={onSaveAsTemplate}
                  disabled={!response.trim()}
                >
                  <Icon name="star" size={12} /> Save template
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={onGenerate}
                  disabled={generating || !modelLoaded || !input.trim()}
                >
                  <Icon name="refresh" size={12} /> Regenerate
                </button>
                <div className="spacer" />
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  onClick={onCopyResponse}
                  disabled={!response.trim()}
                >
                  <Icon name="copy" size={12} /> Copy response
                </button>
              </div>
            </div>
          )}

          {!hasResponse && !generating && (
            <div className="panel">
              <div className="panel__body">
                <div className="empty">
                  {modelLoaded
                    ? "Paste a ticket or describe the issue in the Query panel, then press Generate to draft a grounded response."
                    : "Load a local model in Settings, then generate a grounded response here."}
                </div>
              </div>
            </div>
          )}

          {/* Sources panel */}
          {sources.length > 0 && (
            <div className="panel">
              <div className="panel__header">
                <div className="panel__titleBlock">
                  <div className="panel__title">
                    <Icon name="book" size={13} /> Sources
                  </div>
                  <div className="panel__subtitle">
                    Cited in this response · click to open
                  </div>
                </div>
                <span className="badge">Hybrid retrieval</span>
              </div>
              <div className="panel__body">
                <div className="sources">
                  {sources.map((s, i) => (
                    <button
                      type="button"
                      key={s.chunk_id || `${s.file_path}-${i}`}
                      className="source"
                      onClick={() => {
                        if (onNavigateToSource) {
                          onNavigateToSource(s.title ?? s.file_path);
                        }
                      }}
                    >
                      <div className="source__num">{i + 1}</div>
                      <div className="source__body">
                        <div className="source__title">
                          {s.title ?? s.file_path}
                        </div>
                        <div className="source__meta">
                          {s.heading_path
                            ? `${s.file_path} · ${s.heading_path}`
                            : s.file_path}
                        </div>
                      </div>
                      <div className="source__score">{s.score.toFixed(2)}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Alternatives */}
          {alternatives.length > 0 && (
            <div className="panel">
              <div className="panel__header">
                <div className="panel__titleBlock">
                  <div className="panel__title">
                    <Icon name="sparkles" size={13} /> Alternatives
                  </div>
                  <div className="panel__subtitle">
                    Same answer, different voice
                  </div>
                </div>
              </div>
              <div className="panel__body">
                <div className="alternatives">
                  {alternatives.map((alt, i) => (
                    <button
                      type="button"
                      key={alt.id}
                      className="alt-chip"
                      onClick={() => onUseAlternative(alt)}
                      title="Use this alternative as the response"
                    >
                      <div className="alt-chip__label">Alt {i + 1}</div>
                      <div className="alt-chip__preview">
                        {alt.alternative_text.slice(0, 160)}
                        {alt.alternative_text.length > 160 ? "…" : ""}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
