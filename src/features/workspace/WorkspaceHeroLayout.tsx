/**
 * WorkspaceHeroLayout — three-region Workspace (Draft) renderer.
 *
 * Regions (≥1280px):
 *   ┌───────────────────────────────────────────────┐
 *   │  COMPOSER   (sticky, full width)              │
 *   ├───────────────────────────┬───────────────────┤
 *   │  ANSWER HERO              │  TRIAGE RAIL      │
 *   │  (reads like prose,       │  (workflow,       │
 *   │   16px/1.65, 70ch)        │   signals, alts,  │
 *   │                           │   feedback,       │
 *   │                           │   context, model) │
 *   └───────────────────────────┴───────────────────┘
 *
 * Drop-in replacement for ClaudeDesignWorkspace — the shared props are
 * identical; three optional props (onRateResponse, onFlagKbGap,
 * retrievalLatencyMs) wire the rail's feedback surface.
 *
 * All class names are scoped under `.wsx` so the rules in
 * `src/styles/revamp/workspaceHero.css` never collide with the existing
 * `.cdw`-scoped rules in `claudeDesignWorkspace.css`.
 */

import { useMemo, useState } from "react";
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
import "../../styles/revamp/workspaceHero.css";

export interface WorkspaceHeroLayoutProps {
  ticket: JiraTicket | null;
  ticketId: string | null;

  input: string;
  onInputChange: (value: string) => void;
  responseLength: ResponseLength;
  onResponseLengthChange: (length: ResponseLength) => void;

  hasInput: boolean;
  hasDiagnosis: boolean;
  hasResponseReady: boolean;
  handoffTouched: boolean;

  response: string;
  streamingText: string;
  isStreaming: boolean;
  sources: ContextSource[];
  metrics: GenerationMetrics | null;
  confidence: ConfidenceAssessment | null;
  grounding: GroundedClaim[];
  alternatives: ResponseAlternative[];

  generating: boolean;
  modelLoaded: boolean;
  loadedModelName: string | null;

  caseIntake: CaseIntake;
  onIntakeFieldChange: (
    field: "note_audience" | "likely_category" | "urgency" | "environment",
    value: string | null,
  ) => void;

  onGenerate: () => void;
  onCancel: () => void;
  onCopyResponse: () => void;
  onSaveAsTemplate: () => void;
  onUseAlternative: (alt: ResponseAlternative) => void;
  onNavigateToSource?: (searchQuery: string) => void;

  onRateResponse?: (rating: "up" | "down") => void;
  onFlagKbGap?: () => void;
  retrievalLatencyMs?: number | null;
}

const INTENT_CHIPS: ReadonlyArray<{ value: string; label: string }> = [
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

function initialsFor(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

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

function deriveIntentClass(category: string | null | undefined): string | null {
  if (!category) return null;
  const slug = category
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || null;
}

/**
 * Split a draft into paragraph nodes and render inline [n] citations
 * as accent pills inside each paragraph. Multi-paragraph drafts get
 * `<p>` wrappers so the prose picks up the 14px paragraph gap defined
 * in workspaceHero.css.
 */
function renderProse(
  text: string,
  sources: ContextSource[],
  onNavigateToSource: ((searchQuery: string) => void) | undefined,
  streamingTail: boolean,
): ReactNode[] {
  if (!text) return [];
  const paragraphs = text.split(/\n{2,}/);
  const out: ReactNode[] = [];
  const citeRegex = /\[(\d+)\]/g;

  paragraphs.forEach((para, pi) => {
    const parts: ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let keyIdx = 0;
    citeRegex.lastIndex = 0;
    while ((match = citeRegex.exec(para)) !== null) {
      if (match.index > lastIndex) {
        parts.push(para.slice(lastIndex, match.index));
      }
      const n = Number.parseInt(match[1] ?? "0", 10);
      const source = n > 0 ? sources[n - 1] : undefined;
      const title = source?.title ?? source?.file_path ?? `Source ${n}`;
      const searchQuery = source?.title ?? source?.file_path ?? "";
      parts.push(
        <button
          key={`cite-${pi}-${keyIdx++}`}
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
      lastIndex = citeRegex.lastIndex;
    }
    if (lastIndex < para.length) {
      parts.push(para.slice(lastIndex));
    }
    const isLast = pi === paragraphs.length - 1;
    out.push(
      <p key={`p-${pi}`}>
        {parts}
        {isLast && streamingTail && (
          <span className="streaming-dot" aria-label="streaming" />
        )}
      </p>,
    );
  });
  return out;
}

export function WorkspaceHeroLayout({
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
  onRateResponse,
  onFlagKbGap,
  retrievalLatencyMs,
}: WorkspaceHeroLayoutProps) {
  const displayedResponse = isStreaming ? streamingText : response;
  const hasResponse = Boolean(displayedResponse.trim());

  const activeIntent = useMemo(
    () => deriveIntentClass(caseIntake.likely_category),
    [caseIntake.likely_category],
  );

  const stages = useMemo(() => {
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
      { n: 1, label: "Triage", hint: "Ticket captured", done: triageDone },
      {
        n: 2,
        label: "Classify",
        hint: "ML intent + category",
        done: classifyDone,
      },
      {
        n: 3,
        label: "Draft response",
        hint: "KB-grounded answer",
        done: draftDone,
      },
      {
        n: 4,
        label: "Send to Jira",
        hint: "Copy or post",
        done: sendDone,
      },
    ].map((s, i) => ({
      ...s,
      state: s.done ? "done" : i === activeIdx ? "active" : "",
    }));
  }, [hasInput, hasDiagnosis, activeIntent, hasResponseReady, handoffTouched]);

  const gaugePercent = confidence ? Math.round(confidence.score * 100) : null;
  const confidenceTone = !confidence
    ? null
    : confidence.mode === "answer"
      ? "good"
      : confidence.mode === "clarify"
        ? "warn"
        : "bad";
  const confidenceLabel =
    confidence?.mode === "answer"
      ? "Grounded"
      : confidence?.mode === "clarify"
        ? "Needs clarify"
        : confidence
          ? "Abstain"
          : null;

  const groundedTotal = grounding.length;
  const groundedSupported = grounding.filter(
    (g: GroundedClaim) => g.support_level === "supported",
  ).length;
  const groundedPct =
    groundedTotal > 0
      ? Math.round((groundedSupported / groundedTotal) * 100)
      : 0;

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

  const [rating, setRating] = useState<"up" | "down" | null>(null);
  const handleRate = (value: "up" | "down") => {
    setRating((prev) => (prev === value ? null : value));
    if (onRateResponse) onRateResponse(value);
  };

  return (
    <div className="wsx" data-has-response={hasResponse ? "1" : "0"}>
      {/* ============================================================
          COMPOSER — sticky, full width
          ============================================================ */}
      <div className="wsx__composer" role="region" aria-label="Query composer">
        <div className="wsx__ticketBar">
          <div className="wsx__ticketId">
            {ticketKey
              ? `${ticketKey} · ${ticketIssueType.toUpperCase()}`
              : "NO TICKET LOADED"}
          </div>
          <div className="wsx__ticketSummary" title={ticketSummary}>
            {ticketSummary}
          </div>
          <div className="wsx__ticketMeta">
            <span className="wsx__ticketAvatar" aria-hidden="true">
              {initialsFor(ticketReporter)}
            </span>
            <span className="wsx__ticketReporter">{ticketReporter}</span>
            {ticket?.status && (
              <>
                <span className="wsx__ticketDot">·</span>
                <span>{ticket.status}</span>
              </>
            )}
            {ticketOpened && (
              <>
                <span className="wsx__ticketDot">·</span>
                <span className="wsx__ticketClock">
                  <Icon name="clock" size={11} /> {ticketOpened}
                </span>
              </>
            )}
            <span className="wsx__badge">{ticketPriority}</span>
            {caseIntake.likely_category && (
              <span className="wsx__badge wsx__badge--warn">
                {caseIntake.likely_category}
              </span>
            )}
          </div>
        </div>

        <textarea
          className="wsx__query"
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          placeholder="Paste the ticket or describe the issue…"
          aria-label="Ticket or issue description"
        />

        <div className="wsx__composerFooter">
          <div
            className="wsx__chips"
            role="radiogroup"
            aria-label="Detected intent"
          >
            {INTENT_CHIPS.map((c) => {
              const isOn = intakeCategoryChip === c.value;
              return (
                <button
                  key={c.value}
                  type="button"
                  role="radio"
                  aria-checked={isOn}
                  className={["wsx__chip", isOn ? "is-on" : ""]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() =>
                    onIntakeFieldChange(
                      "likely_category",
                      isOn ? null : c.label,
                    )
                  }
                >
                  <span className="wsx__chipDot" aria-hidden="true" />
                  {c.label}
                </button>
              );
            })}
          </div>

          <div className="wsx__composerRight">
            <div
              className="wsx__seg"
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

            {generating ? (
              <button type="button" className="wsx__btn" onClick={onCancel}>
                <Icon name="stop" size={12} /> Cancel
              </button>
            ) : (
              <button
                type="button"
                className="wsx__btn wsx__btn--primary"
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
                <span className="wsx__kbd">⌘↵</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ============================================================
          BODY — answer hero + triage rail
          ============================================================ */}
      <div className="wsx__body">
        {/* ---------- ANSWER HERO ---------- */}
        <section className="wsx__answer" aria-label="KB-grounded answer">
          {hasResponse ? (
            <div className="wsx__answerInner">
              {(confidence || activeIntent || caseIntake.likely_category) && (
                <header
                  className={[
                    "wsx__answerHead",
                    confidenceTone ? `is-${confidenceTone}` : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {(activeIntent || caseIntake.likely_category) && (
                    <div className="wsx__intent">
                      <span className="wsx__intentLabel">ML Intent</span>
                      <span className="wsx__intentClass">
                        {(
                          caseIntake.likely_category ??
                          activeIntent ??
                          ""
                        ).toUpperCase()}
                        {activeIntent && caseIntake.likely_category
                          ? ` · ${activeIntent}`
                          : ""}
                      </span>
                    </div>
                  )}

                  {confidence && (
                    <div
                      className="wsx__gauge"
                      aria-label={`Confidence ${gaugePercent ?? "--"}%, ${
                        confidenceLabel ?? ""
                      }`}
                    >
                      <span
                        className={[
                          "wsx__gaugePill",
                          confidenceTone ? `is-${confidenceTone}` : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        <Icon name="shield" size={10} />
                        {confidenceLabel}
                      </span>
                      <div
                        className="wsx__gaugeBar"
                        style={{
                          ["--v" as string]: `${gaugePercent ?? 0}%`,
                        }}
                      />
                      <span className="wsx__gaugeNum">
                        {gaugePercent != null ? `${gaugePercent}%` : "--"}
                      </span>
                    </div>
                  )}
                </header>
              )}

              <div className="wsx__meta">
                <span className="wsx__metaItem">
                  <Icon name="zap" size={11} /> <b>{tokensPerSec.toFixed(0)}</b>{" "}
                  tok/s
                </span>
                <span className="wsx__metaItem">
                  <Icon name="book" size={11} /> <b>{sourcesCount}</b> sources
                </span>
                <span className="wsx__metaItem">
                  <Icon name="file-text" size={11} /> <b>{wordCount}</b> words
                </span>
                {contextUtilPct != null && (
                  <span className="wsx__metaItem">
                    <Icon name="database" size={11} /> <b>{contextUtilPct}%</b>{" "}
                    ctx
                  </span>
                )}
                {groundedTotal > 0 && (
                  <span className="wsx__metaItem">
                    <Icon name="check" size={11} />{" "}
                    <b>
                      {groundedSupported}/{groundedTotal}
                    </b>{" "}
                    claims supported
                  </span>
                )}
                <span className="wsx__metaItem wsx__metaItem--mono wsx__metaItem--muted">
                  {loadedModelName ?? "model unloaded"}
                </span>
              </div>

              <article className="wsx__prose">
                {renderProse(
                  displayedResponse,
                  sources,
                  onNavigateToSource,
                  isStreaming,
                )}
              </article>

              <div className="wsx__answerActions">
                <button
                  type="button"
                  className="wsx__btn wsx__btn--ghost wsx__btn--sm"
                  onClick={onGenerate}
                  disabled={generating || !modelLoaded || !input.trim()}
                >
                  <Icon name="refresh" size={12} /> Regenerate
                </button>
                <button
                  type="button"
                  className="wsx__btn wsx__btn--ghost wsx__btn--sm"
                  onClick={onSaveAsTemplate}
                  disabled={!response.trim()}
                >
                  <Icon name="star" size={12} /> Save template
                </button>
                <div className="wsx__spacer" />
                <button
                  type="button"
                  className="wsx__btn wsx__btn--primary wsx__btn--sm"
                  onClick={onCopyResponse}
                  disabled={!response.trim()}
                >
                  <Icon name="copy" size={12} /> Copy response
                </button>
              </div>

              {sources.length > 0 && (
                <section className="wsx__sources" aria-label="Cited sources">
                  <header className="wsx__sourcesHead">
                    <span className="wsx__sourcesTitle">Cited sources</span>
                    <span className="wsx__sourcesHint">
                      click to open · hybrid retrieval
                    </span>
                  </header>
                  <ul>
                    {sources.map((s, i) => (
                      <li key={s.chunk_id || `${s.file_path}-${i}`}>
                        <button
                          type="button"
                          className="wsx__source"
                          onClick={() => {
                            if (onNavigateToSource) {
                              onNavigateToSource(s.title ?? s.file_path);
                            }
                          }}
                        >
                          <span className="wsx__sourceNum">{i + 1}</span>
                          <span className="wsx__sourceBody">
                            <span className="wsx__sourceTitle">
                              {s.title ?? s.file_path}
                            </span>
                            <span className="wsx__sourceMeta">
                              {s.heading_path
                                ? `${s.file_path} · ${s.heading_path}`
                                : s.file_path}
                            </span>
                          </span>
                          <span className="wsx__sourceScore">
                            {s.score.toFixed(2)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          ) : (
            <div className="wsx__empty">
              <div className="wsx__emptyInner">
                <Icon name="sparkles" size={18} />
                <p>
                  {modelLoaded
                    ? "Paste a ticket or describe the issue above, then press Generate. The KB-grounded draft appears here — ready to review, rate, and copy."
                    : "Load a local model in Settings, then generate a KB-grounded draft here."}
                </p>
              </div>
            </div>
          )}
        </section>

        {/* ---------- TRIAGE RAIL ---------- */}
        <aside className="wsx__rail" aria-label="Triage and feedback">
          <div className="wsx__railCard">
            <div className="wsx__railTitle">Workflow</div>
            <ol className="wsx__steps">
              {stages.map((stage) => (
                <li
                  key={stage.n}
                  className={[
                    "wsx__step",
                    stage.state === "active" ? "is-active" : "",
                    stage.state === "done" ? "is-done" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <span className="wsx__stepNum">
                    {stage.state === "done" ? (
                      <Icon name="check" size={11} />
                    ) : (
                      stage.n
                    )}
                  </span>
                  <span className="wsx__stepText">
                    <span className="wsx__stepLabel">{stage.label}</span>
                    <span className="wsx__stepHint">{stage.hint}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>

          {(confidence || groundedTotal > 0 || retrievalLatencyMs != null) && (
            <div className="wsx__railCard">
              <div className="wsx__railTitle">Signals</div>
              <dl className="wsx__stats">
                {confidence && (
                  <div className="wsx__stat">
                    <dt>Confidence</dt>
                    <dd
                      className={[
                        "wsx__statValue",
                        confidenceTone ? `is-${confidenceTone}` : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {gaugePercent != null ? `${gaugePercent}%` : "--"}
                    </dd>
                  </div>
                )}
                {groundedTotal > 0 && (
                  <div className="wsx__stat">
                    <dt>Grounded claims</dt>
                    <dd>
                      <span className="wsx__statValue">
                        {groundedSupported}/{groundedTotal}
                      </span>
                      <div
                        className="wsx__miniBar"
                        style={{
                          ["--v" as string]: `${groundedPct}%`,
                        }}
                      />
                    </dd>
                  </div>
                )}
                {retrievalLatencyMs != null && (
                  <div className="wsx__stat">
                    <dt>Retrieval</dt>
                    <dd className="wsx__statValue wsx__statValue--mono">
                      {Math.round(retrievalLatencyMs)}ms
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          )}

          {alternatives.length > 0 && (
            <div className="wsx__railCard">
              <div className="wsx__railTitle">Alternatives</div>
              <ul className="wsx__alts">
                {alternatives.map((alt, i) => (
                  <li key={alt.id} className="wsx__alt">
                    <div className="wsx__altHead">ALT {i + 1}</div>
                    <div className="wsx__altPreview">
                      {alt.alternative_text.slice(0, 160)}
                      {alt.alternative_text.length > 160 ? "…" : ""}
                    </div>
                    <button
                      type="button"
                      className="wsx__btn wsx__btn--ghost wsx__btn--sm"
                      onClick={() => onUseAlternative(alt)}
                    >
                      Use this
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="wsx__railCard">
            <div className="wsx__railTitle">Feedback</div>
            <div
              className="wsx__thumbs"
              role="group"
              aria-label="Rate response"
            >
              <button
                type="button"
                className={["wsx__thumb", rating === "up" ? "is-on" : ""]
                  .filter(Boolean)
                  .join(" ")}
                aria-pressed={rating === "up"}
                onClick={() => handleRate("up")}
                disabled={!hasResponse}
                title="This draft is good"
              >
                <Icon name="check" size={13} />
              </button>
              <button
                type="button"
                className={[
                  "wsx__thumb",
                  "wsx__thumb--down",
                  rating === "down" ? "is-on" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                aria-pressed={rating === "down"}
                onClick={() => handleRate("down")}
                disabled={!hasResponse}
                title="This draft is off"
              >
                <Icon name="x" size={13} />
              </button>
              <span className="wsx__thumbsHint">
                {rating === "up"
                  ? "Logged · feeds gap analyzer"
                  : rating === "down"
                    ? "Logged · shown in KB gap report"
                    : "Rate to seed the feedback loop"}
              </span>
            </div>
            <button
              type="button"
              className="wsx__btn wsx__btn--ghost wsx__btn--sm wsx__btn--wide"
              onClick={onFlagKbGap}
              disabled={!hasResponse || !onFlagKbGap}
            >
              <Icon name="alert-triangle" size={12} /> Flag as KB gap
            </button>
          </div>

          <div className="wsx__railCard">
            <div className="wsx__railTitle">Context</div>
            <div className="wsx__fields">
              <label className="wsx__field">
                <span>Audience</span>
                <select
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
              </label>
              <label className="wsx__field">
                <span>Tone</span>
                <select defaultValue="neutral">
                  {TONE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="wsx__field">
                <span>Urgency</span>
                <select
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
              </label>
              <label className="wsx__field">
                <span>Environment</span>
                <input
                  type="text"
                  placeholder="e.g. macOS 14, Okta SSO"
                  value={caseIntake.environment ?? ""}
                  onChange={(e) =>
                    onIntakeFieldChange("environment", e.target.value || null)
                  }
                />
              </label>
            </div>
          </div>

          <div className="wsx__railFooter">
            <span className="wsx__railFooterModel">
              {loadedModelName ?? "model unloaded"}
            </span>
            {contextUtilPct != null && (
              <span className="wsx__railFooterCtx">ctx {contextUtilPct}%</span>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
