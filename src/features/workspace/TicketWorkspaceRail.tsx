import { useEffect, useMemo, useState } from "react";
import { Button } from "../../components/shared/Button";
import { DiffViewer } from "../../components/FollowUps/DiffViewer";
import type {
  CaseIntake,
  EvidencePack,
  GuidedRunbookSession,
  GuidedRunbookTemplate,
  HandoffPack,
  KbDraft,
  MissingQuestion,
  NextActionRecommendation,
  NoteAudience,
  ResolutionKit,
  SimilarCase,
  WorkspaceFavorite,
  WorkspacePersonalization,
} from "../../types/workspace";
import { markWorkspaceReady } from "./workspacePerformanceMetrics";
import "./TicketWorkspaceRail.css";

type IntakeField =
  | "issue"
  | "environment"
  | "impact"
  | "affected_user"
  | "affected_system"
  | "affected_site"
  | "symptoms"
  | "steps_tried"
  | "blockers"
  | "likely_category";

interface TicketWorkspaceRailProps {
  intake: CaseIntake;
  onIntakeChange: (field: IntakeField, value: string) => void;
  onAnalyzeIntake: () => void;
  onApplyIntakePreset: (
    preset: "incident" | "access" | "rollout" | "device",
  ) => void;
  onNoteAudienceChange: (audience: NoteAudience) => void;
  nextActions: NextActionRecommendation[];
  missingQuestions: MissingQuestion[];
  onAcceptNextAction: (action: NextActionRecommendation) => void;
  similarCases: SimilarCase[];
  similarCasesLoading: boolean;
  onRefreshSimilarCases: () => void;
  onOpenSimilarCase: (similarCase: SimilarCase) => void;
  onCompareSimilarCase: (similarCase: SimilarCase) => void;
  onCompareLastResolution: () => void;
  compareCase: SimilarCase | null;
  onCloseCompareCase: () => void;
  handoffPack: HandoffPack;
  evidencePack: EvidencePack;
  kbDraft: KbDraft;
  onCopyHandoffPack: () => void;
  onCopyEvidencePack: () => void;
  onCopyKbDraft: () => void;
  resolutionKits: ResolutionKit[];
  onSaveResolutionKit: () => void;
  onApplyResolutionKit: (kit: ResolutionKit) => void;
  favorites: WorkspaceFavorite[];
  onToggleFavorite: (
    kind: WorkspaceFavorite["kind"],
    resourceId: string,
    label: string,
    metadata?: Record<string, string> | null,
  ) => void;
  runbookTemplates: GuidedRunbookTemplate[];
  guidedRunbookSession: GuidedRunbookSession | null;
  runbookNote: string;
  onRunbookNoteChange: (value: string) => void;
  onStartGuidedRunbook: (templateId: string) => void;
  onAdvanceGuidedRunbook: (status: "completed" | "skipped" | "failed") => void;
  onCopyRunbookProgressToNotes: () => void;
  workspacePersonalization: WorkspacePersonalization;
  onPersonalizationChange: (patch: Partial<WorkspacePersonalization>) => void;
  workspaceCatalogLoading: boolean;
  currentResponse: string;
}

const NOTE_AUDIENCES: Array<{ id: NoteAudience; label: string }> = [
  { id: "internal-note", label: "Internal note" },
  { id: "customer-safe", label: "Customer-safe" },
  { id: "escalation-note", label: "Escalation note" },
];

const INTAKE_FIELDS: Array<{ key: IntakeField; label: string; rows?: number }> =
  [
    { key: "issue", label: "Issue summary" },
    { key: "environment", label: "Environment" },
    { key: "impact", label: "Impact", rows: 2 },
    { key: "affected_user", label: "Affected user" },
    { key: "affected_system", label: "Affected system" },
    { key: "affected_site", label: "Affected site" },
    { key: "symptoms", label: "Symptoms", rows: 3 },
    { key: "steps_tried", label: "Steps already tried", rows: 3 },
    { key: "blockers", label: "Current blocker", rows: 2 },
    { key: "likely_category", label: "Likely category" },
  ];

function IntakeFieldControl({
  label,
  value,
  rows,
  onChange,
}: {
  label: string;
  value: string;
  rows?: number;
  onChange: (value: string) => void;
}) {
  if (rows && rows > 1) {
    return (
      <label className="ticket-workspace-rail__field">
        <span>{label}</span>
        <textarea
          rows={rows}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
    );
  }

  return (
    <label className="ticket-workspace-rail__field">
      <span>{label}</span>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

export function TicketWorkspaceRail({
  intake,
  onIntakeChange,
  onAnalyzeIntake,
  onApplyIntakePreset,
  onNoteAudienceChange,
  nextActions,
  missingQuestions,
  onAcceptNextAction,
  similarCases,
  similarCasesLoading,
  onRefreshSimilarCases,
  onOpenSimilarCase,
  onCompareSimilarCase,
  onCompareLastResolution,
  compareCase,
  onCloseCompareCase,
  handoffPack,
  evidencePack,
  kbDraft,
  onCopyHandoffPack,
  onCopyEvidencePack,
  onCopyKbDraft,
  resolutionKits,
  onSaveResolutionKit,
  onApplyResolutionKit,
  favorites,
  onToggleFavorite,
  runbookTemplates,
  guidedRunbookSession,
  runbookNote,
  onRunbookNoteChange,
  onStartGuidedRunbook,
  onAdvanceGuidedRunbook,
  onCopyRunbookProgressToNotes,
  workspacePersonalization,
  onPersonalizationChange,
  workspaceCatalogLoading,
  currentResponse,
}: TicketWorkspaceRailProps) {
  const [selectedRunbookTemplateId, setSelectedRunbookTemplateId] =
    useState("");
  const intakeMissing = useMemo(
    () => intake.missing_data ?? [],
    [intake.missing_data],
  );
  const favoriteLookup = useMemo(
    () =>
      new Set(
        favorites.map((favorite) => `${favorite.kind}:${favorite.resource_id}`),
      ),
    [favorites],
  );
  const currentRunbookStepLabel = useMemo(() => {
    if (!guidedRunbookSession) {
      return null;
    }
    return (
      guidedRunbookSession.steps[guidedRunbookSession.current_step] ?? null
    );
  }, [guidedRunbookSession]);

  useEffect(() => {
    markWorkspaceReady();
  }, []);

  return (
    <div className="ticket-workspace-rail">
      <section className="ticket-workspace-rail__section">
        <div className="ticket-workspace-rail__section-header">
          <div>
            <h3>Ticket workspace</h3>
            <p>
              Keep intake, handoff, and similar-case work visible beside the
              draft.
            </p>
          </div>
          <Button variant="secondary" size="small" onClick={onAnalyzeIntake}>
            Analyze intake
          </Button>
        </div>

        <div className="ticket-workspace-rail__subsection">
          <h4>Personalization</h4>
          <div className="ticket-workspace-rail__form">
            <label className="ticket-workspace-rail__field">
              <span>Default note audience</span>
              <select
                value={workspacePersonalization.preferred_note_audience}
                onChange={(event) =>
                  onPersonalizationChange({
                    preferred_note_audience: event.target.value as NoteAudience,
                  })
                }
              >
                {NOTE_AUDIENCES.map((audience) => (
                  <option key={audience.id} value={audience.id}>
                    {audience.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="ticket-workspace-rail__field">
              <span>Default output length</span>
              <select
                value={workspacePersonalization.preferred_output_length}
                onChange={(event) =>
                  onPersonalizationChange({
                    preferred_output_length: event.target
                      .value as WorkspacePersonalization["preferred_output_length"],
                  })
                }
              >
                <option value="Short">Short</option>
                <option value="Medium">Medium</option>
                <option value="Long">Long</option>
              </select>
            </label>
            <label className="ticket-workspace-rail__field">
              <span>Evidence pack format</span>
              <select
                value={workspacePersonalization.default_evidence_format}
                onChange={(event) =>
                  onPersonalizationChange({
                    default_evidence_format: event.target
                      .value as WorkspacePersonalization["default_evidence_format"],
                  })
                }
              >
                <option value="clipboard">Clipboard</option>
                <option value="markdown">Markdown</option>
              </select>
            </label>
          </div>
        </div>

        <div
          className="ticket-workspace-rail__audiences"
          role="group"
          aria-label="Note audience"
        >
          {NOTE_AUDIENCES.map((audience) => (
            <button
              key={audience.id}
              type="button"
              className={`ticket-workspace-rail__chip ${intake.note_audience === audience.id ? "is-active" : ""}`}
              aria-pressed={intake.note_audience === audience.id}
              onClick={() => onNoteAudienceChange(audience.id)}
            >
              {audience.label}
            </button>
          ))}
        </div>

        <div className="ticket-workspace-rail__preset-row">
          <span>Quick presets</span>
          <div>
            <button
              type="button"
              className="ticket-workspace-rail__mini-btn"
              onClick={() => onApplyIntakePreset("incident")}
            >
              Incident
            </button>
            <button
              type="button"
              className="ticket-workspace-rail__mini-btn"
              onClick={() => onApplyIntakePreset("access")}
            >
              Access
            </button>
            <button
              type="button"
              className="ticket-workspace-rail__mini-btn"
              onClick={() => onApplyIntakePreset("rollout")}
            >
              Change
            </button>
            <button
              type="button"
              className="ticket-workspace-rail__mini-btn"
              onClick={() => onApplyIntakePreset("device")}
            >
              Device
            </button>
          </div>
        </div>

        {intakeMissing.length > 0 && (
          <div className="ticket-workspace-rail__alert" role="status">
            Missing context: {intakeMissing.join(", ")}.
          </div>
        )}

        <div className="ticket-workspace-rail__form">
          {INTAKE_FIELDS.map((field) => (
            <IntakeFieldControl
              key={field.key}
              label={field.label}
              value={(intake[field.key] as string | null | undefined) ?? ""}
              rows={field.rows}
              onChange={(value) => onIntakeChange(field.key, value)}
            />
          ))}
        </div>
      </section>

      <section className="ticket-workspace-rail__section">
        <div className="ticket-workspace-rail__section-header">
          <div>
            <h3>Next best actions</h3>
            <p>Decision support stays explicit and explainable.</p>
          </div>
        </div>
        {nextActions.length === 0 ? (
          <p className="ticket-workspace-rail__empty">
            No suggested actions yet. Complete intake or generate a response
            first.
          </p>
        ) : (
          <div className="ticket-workspace-rail__stack">
            {nextActions.map((action) => (
              <article key={action.id} className="ticket-workspace-rail__card">
                <div className="ticket-workspace-rail__card-header">
                  <strong>{action.label}</strong>
                  <span>{Math.round(action.confidence * 100)}%</span>
                </div>
                <p>{action.rationale}</p>
                {action.prerequisites.length > 0 && (
                  <ul>
                    {action.prerequisites.map((prerequisite) => (
                      <li key={prerequisite}>{prerequisite}</li>
                    ))}
                  </ul>
                )}
                <Button
                  variant="ghost"
                  size="small"
                  onClick={() => onAcceptNextAction(action)}
                >
                  Use this action
                </Button>
              </article>
            ))}
          </div>
        )}

        {missingQuestions.length > 0 && (
          <div className="ticket-workspace-rail__subsection">
            <h4>Missing questions</h4>
            <ul className="ticket-workspace-rail__questions">
              {missingQuestions.map((question) => (
                <li key={question.id}>
                  <strong>{question.question}</strong>
                  <span>{question.reason}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="ticket-workspace-rail__section">
        <div className="ticket-workspace-rail__section-header">
          <div>
            <h3>Similar solved cases</h3>
            <p>Reuse past work before starting from scratch.</p>
          </div>
          <div className="ticket-workspace-rail__actions">
            <Button
              variant="ghost"
              size="small"
              onClick={onRefreshSimilarCases}
            >
              {similarCasesLoading ? "Refreshing..." : "Refresh"}
            </Button>
            <Button
              variant="secondary"
              size="small"
              disabled={!currentResponse.trim() || similarCases.length === 0}
              onClick={onCompareLastResolution}
            >
              Compare latest
            </Button>
          </div>
        </div>
        {similarCasesLoading ? (
          <p className="ticket-workspace-rail__empty">
            Looking for similar solved work...
          </p>
        ) : similarCases.length === 0 ? (
          <p className="ticket-workspace-rail__empty">
            No similar cases yet for this ticket.
          </p>
        ) : (
          <div className="ticket-workspace-rail__stack">
            {similarCases.map((similarCase) => (
              <article
                key={similarCase.draft_id}
                className="ticket-workspace-rail__card"
              >
                <div className="ticket-workspace-rail__card-header">
                  <strong>{similarCase.title}</strong>
                  <span>{Math.round(similarCase.match_score * 100)}%</span>
                </div>
                <p>{similarCase.explanation.summary}</p>
                <div className="ticket-workspace-rail__excerpt">
                  <strong>Case:</strong> {similarCase.excerpt}
                </div>
                {similarCase.response_excerpt && (
                  <div className="ticket-workspace-rail__excerpt">
                    <strong>Resolution:</strong> {similarCase.response_excerpt}
                  </div>
                )}
                <div className="ticket-workspace-rail__actions">
                  <Button
                    variant="secondary"
                    size="small"
                    onClick={() => onOpenSimilarCase(similarCase)}
                  >
                    Open case
                  </Button>
                  <Button
                    variant="ghost"
                    size="small"
                    disabled={
                      !currentResponse.trim() ||
                      !similarCase.response_text.trim()
                    }
                    onClick={() => onCompareSimilarCase(similarCase)}
                  >
                    Compare
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="ticket-workspace-rail__section">
        <div className="ticket-workspace-rail__section-header">
          <div>
            <h3>Handoff pack</h3>
            <p>Keep the next operator or escalation path ready.</p>
          </div>
          <Button variant="secondary" size="small" onClick={onCopyHandoffPack}>
            Copy pack
          </Button>
        </div>
        <div className="ticket-workspace-rail__summary-block">
          <strong>Summary</strong>
          <p>{handoffPack.summary}</p>
        </div>
        <div className="ticket-workspace-rail__summary-block">
          <strong>Current blocker</strong>
          <p>{handoffPack.current_blocker}</p>
        </div>
        <div className="ticket-workspace-rail__summary-block">
          <strong>Next step</strong>
          <p>{handoffPack.next_step}</p>
        </div>
        <div className="ticket-workspace-rail__summary-block">
          <strong>Customer-safe update</strong>
          <p>{handoffPack.customer_safe_update}</p>
        </div>
      </section>

      <section className="ticket-workspace-rail__section">
        <div className="ticket-workspace-rail__section-header">
          <div>
            <h3>Evidence and KB</h3>
            <p>Package the work for escalation or knowledge capture.</p>
          </div>
        </div>
        <div className="ticket-workspace-rail__actions">
          <Button variant="secondary" size="small" onClick={onCopyEvidencePack}>
            Copy evidence pack
          </Button>
          <Button variant="ghost" size="small" onClick={onCopyKbDraft}>
            Copy KB draft
          </Button>
        </div>
        <div className="ticket-workspace-rail__summary-block">
          <strong>{evidencePack.title}</strong>
          <p>{evidencePack.summary}</p>
        </div>
        <div className="ticket-workspace-rail__summary-block">
          <strong>KB draft</strong>
          <p>{kbDraft.title}</p>
          <span>{kbDraft.tags.join(", ") || "No tags yet"}</span>
        </div>
      </section>

      <section className="ticket-workspace-rail__section">
        <div className="ticket-workspace-rail__section-header">
          <div>
            <h3>Resolution kits</h3>
            <p>
              Save the best issue families so future tickets start from a proven
              pattern.
            </p>
          </div>
          <Button
            variant="secondary"
            size="small"
            onClick={onSaveResolutionKit}
          >
            Save current as kit
          </Button>
        </div>
        {workspaceCatalogLoading && resolutionKits.length === 0 ? (
          <p className="ticket-workspace-rail__empty">Loading saved kits...</p>
        ) : resolutionKits.length === 0 ? (
          <p className="ticket-workspace-rail__empty">
            No saved kits yet. Save the current workspace when you solve a
            repeatable issue.
          </p>
        ) : (
          <div className="ticket-workspace-rail__stack">
            {resolutionKits.map((kit) => {
              const isFavorite = favoriteLookup.has(`kit:${kit.id}`);
              return (
                <article key={kit.id} className="ticket-workspace-rail__card">
                  <div className="ticket-workspace-rail__card-header">
                    <strong>{kit.name}</strong>
                    <span>{kit.category}</span>
                  </div>
                  <p>{kit.summary}</p>
                  {kit.checklist_items.length > 0 && (
                    <ul>
                      {kit.checklist_items.slice(0, 3).map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  )}
                  <div className="ticket-workspace-rail__actions">
                    <Button
                      variant="secondary"
                      size="small"
                      onClick={() => onApplyResolutionKit(kit)}
                    >
                      Apply kit
                    </Button>
                    <Button
                      variant="ghost"
                      size="small"
                      onClick={() =>
                        onToggleFavorite("kit", kit.id, kit.name, {
                          category: kit.category,
                        })
                      }
                    >
                      {isFavorite ? "Unfavorite" : "Favorite"}
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="ticket-workspace-rail__section">
        <div className="ticket-workspace-rail__section-header">
          <div>
            <h3>Guided runbooks</h3>
            <p>
              Use a repeatable step path, record evidence, and copy the outcome
              into your notes.
            </p>
          </div>
        </div>
        <div className="ticket-workspace-rail__form">
          <label className="ticket-workspace-rail__field">
            <span>Runbook template</span>
            <select
              value={selectedRunbookTemplateId}
              onChange={(event) =>
                setSelectedRunbookTemplateId(event.target.value)
              }
            >
              <option value="">Choose a template</option>
              {runbookTemplates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="ticket-workspace-rail__actions">
          <Button
            variant="secondary"
            size="small"
            disabled={!selectedRunbookTemplateId}
            onClick={() => onStartGuidedRunbook(selectedRunbookTemplateId)}
          >
            Start template
          </Button>
          {selectedRunbookTemplateId && (
            <Button
              variant="ghost"
              size="small"
              onClick={() => {
                const selectedTemplate = runbookTemplates.find(
                  (template) => template.id === selectedRunbookTemplateId,
                );
                if (selectedTemplate) {
                  onToggleFavorite(
                    "runbook",
                    selectedTemplate.id,
                    selectedTemplate.name,
                    { scenario: selectedTemplate.scenario },
                  );
                }
              }}
            >
              {favoriteLookup.has(`runbook:${selectedRunbookTemplateId}`)
                ? "Unfavorite"
                : "Favorite"}
            </Button>
          )}
        </div>

        {!guidedRunbookSession ? (
          <p className="ticket-workspace-rail__empty">
            No guided runbook active yet.
          </p>
        ) : (
          <div className="ticket-workspace-rail__stack">
            <article className="ticket-workspace-rail__card">
              <div className="ticket-workspace-rail__card-header">
                <strong>{guidedRunbookSession.scenario}</strong>
                <span>{guidedRunbookSession.status}</span>
              </div>
              <p>
                {currentRunbookStepLabel
                  ? `Current step: ${currentRunbookStepLabel}`
                  : "All steps have been captured."}
              </p>
              <label className="ticket-workspace-rail__field">
                <span>Evidence or operator note</span>
                <textarea
                  rows={3}
                  value={runbookNote}
                  onChange={(event) => onRunbookNoteChange(event.target.value)}
                />
              </label>
              <div className="ticket-workspace-rail__actions">
                <Button
                  variant="secondary"
                  size="small"
                  onClick={() => onAdvanceGuidedRunbook("completed")}
                >
                  Complete step
                </Button>
                <Button
                  variant="ghost"
                  size="small"
                  onClick={() => onAdvanceGuidedRunbook("skipped")}
                >
                  Skip
                </Button>
                <Button
                  variant="ghost"
                  size="small"
                  onClick={() => onAdvanceGuidedRunbook("failed")}
                >
                  Fail / pause
                </Button>
                <Button
                  variant="ghost"
                  size="small"
                  onClick={onCopyRunbookProgressToNotes}
                >
                  Copy into notes
                </Button>
              </div>
            </article>
            <div className="ticket-workspace-rail__summary-block">
              <strong>Progress</strong>
              {guidedRunbookSession.steps.length === 0 ? (
                <p>No steps in this runbook.</p>
              ) : (
                <ul className="ticket-workspace-rail__questions">
                  {guidedRunbookSession.steps.map((step, index) => {
                    const evidence = guidedRunbookSession.evidence.find(
                      (item) => item.step_index === index,
                    );
                    const statusLabel =
                      evidence?.status ??
                      (index < guidedRunbookSession.current_step
                        ? "completed"
                        : index === guidedRunbookSession.current_step
                          ? "current"
                          : "pending");
                    return (
                      <li key={`${guidedRunbookSession.id}-${index}`}>
                        <strong>{step}</strong>
                        <span>{statusLabel}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="ticket-workspace-rail__section">
        <div className="ticket-workspace-rail__section-header">
          <div>
            <h3>Favorites</h3>
            <p>
              Keep your most-used kits, runbooks, and references one click away.
            </p>
          </div>
        </div>
        {workspaceCatalogLoading && favorites.length === 0 ? (
          <p className="ticket-workspace-rail__empty">Loading favorites...</p>
        ) : favorites.length === 0 ? (
          <p className="ticket-workspace-rail__empty">
            No favorites yet. Favorite a runbook or resolution kit to surface it
            here.
          </p>
        ) : (
          <div className="ticket-workspace-rail__stack">
            {favorites.map((favorite) => {
              const matchingKit =
                favorite.kind === "kit"
                  ? resolutionKits.find(
                      (kit) => kit.id === favorite.resource_id,
                    )
                  : null;
              const matchingRunbook =
                favorite.kind === "runbook"
                  ? runbookTemplates.find(
                      (template) => template.id === favorite.resource_id,
                    )
                  : null;
              const canApply = Boolean(matchingKit || matchingRunbook);

              return (
                <article
                  key={favorite.id}
                  className="ticket-workspace-rail__card"
                >
                  <div className="ticket-workspace-rail__card-header">
                    <strong>{favorite.label}</strong>
                    <span>{favorite.kind}</span>
                  </div>
                  <div className="ticket-workspace-rail__actions">
                    <Button
                      variant="secondary"
                      size="small"
                      disabled={!canApply}
                      onClick={() => {
                        if (matchingKit) {
                          onApplyResolutionKit(matchingKit);
                          return;
                        }
                        if (matchingRunbook) {
                          onStartGuidedRunbook(matchingRunbook.id);
                        }
                      }}
                    >
                      {matchingKit
                        ? "Apply kit"
                        : matchingRunbook
                          ? "Start runbook"
                          : "Unavailable"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="small"
                      onClick={() =>
                        onToggleFavorite(
                          favorite.kind,
                          favorite.resource_id,
                          favorite.label,
                          favorite.metadata ?? null,
                        )
                      }
                    >
                      Remove
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {compareCase && (
        <DiffViewer
          textA={currentResponse}
          textB={compareCase.response_text}
          labelA="Current draft"
          labelB={compareCase.title}
          onClose={onCloseCompareCase}
        />
      )}
    </div>
  );
}
