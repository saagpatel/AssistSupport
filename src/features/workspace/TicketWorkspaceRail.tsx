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
import {
  INTAKE_FIELDS,
  IntakeFieldControl,
  NOTE_AUDIENCES,
  type IntakeField,
} from "./IntakeFieldControl";
import "./TicketWorkspaceRail.css";

export interface TicketWorkspaceRailIntakeBundle {
  data: CaseIntake;
  onChange: (field: IntakeField, value: string) => void;
  onAnalyze: () => void;
  onApplyPreset: (preset: "incident" | "access" | "rollout" | "device") => void;
  onNoteAudienceChange: (audience: NoteAudience) => void;
  missingQuestions: MissingQuestion[];
}

export interface TicketWorkspaceRailNextActionsBundle {
  items: NextActionRecommendation[];
  onAccept: (action: NextActionRecommendation) => void;
}

export interface TicketWorkspaceRailSimilarCasesBundle {
  items: SimilarCase[];
  loading: boolean;
  onRefresh: () => void;
  onOpen: (similarCase: SimilarCase) => void;
  onCompare: (similarCase: SimilarCase) => void;
  onCompareLast: () => void;
  compareCase: SimilarCase | null;
  onCloseCompare: () => void;
}

export interface TicketWorkspaceRailPacksBundle {
  handoffPack: HandoffPack;
  evidencePack: EvidencePack;
  kbDraft: KbDraft;
  onCopyHandoff: () => void;
  onCopyEvidence: () => void;
  onCopyKb: () => void;
}

export interface TicketWorkspaceRailKitsBundle {
  items: ResolutionKit[];
  onSaveCurrent: () => void;
  onApply: (kit: ResolutionKit) => void;
}

export interface TicketWorkspaceRailFavoritesBundle {
  items: WorkspaceFavorite[];
  onToggle: (
    kind: WorkspaceFavorite["kind"],
    resourceId: string,
    label: string,
    metadata?: Record<string, string> | null,
  ) => void;
}

export interface TicketWorkspaceRailRunbooksBundle {
  templates: GuidedRunbookTemplate[];
  session: GuidedRunbookSession | null;
  note: string;
  onNoteChange: (value: string) => void;
  onStart: (templateId: string) => void;
  onAdvance: (status: "completed" | "skipped" | "failed") => void;
  onCopyProgress: () => void;
}

export interface TicketWorkspaceRailPersonalizationBundle {
  value: WorkspacePersonalization;
  onChange: (patch: Partial<WorkspacePersonalization>) => void;
}

interface TicketWorkspaceRailProps {
  intake: TicketWorkspaceRailIntakeBundle;
  nextActions: TicketWorkspaceRailNextActionsBundle;
  similarCases: TicketWorkspaceRailSimilarCasesBundle;
  packs: TicketWorkspaceRailPacksBundle;
  kits: TicketWorkspaceRailKitsBundle;
  favorites: TicketWorkspaceRailFavoritesBundle;
  runbooks: TicketWorkspaceRailRunbooksBundle;
  personalization: TicketWorkspaceRailPersonalizationBundle;
  workspaceCatalogLoading: boolean;
  currentResponse: string;
}

export function TicketWorkspaceRail({
  intake,
  nextActions,
  similarCases,
  packs,
  kits,
  favorites,
  runbooks,
  personalization,
  workspaceCatalogLoading,
  currentResponse,
}: TicketWorkspaceRailProps) {
  const [selectedRunbookTemplateId, setSelectedRunbookTemplateId] =
    useState("");
  const intakeMissing = useMemo(
    () => intake.data.missing_data ?? [],
    [intake.data.missing_data],
  );
  const favoriteLookup = useMemo(
    () =>
      new Set(
        favorites.items.map(
          (favorite) => `${favorite.kind}:${favorite.resource_id}`,
        ),
      ),
    [favorites.items],
  );
  const currentRunbookStepLabel = useMemo(() => {
    if (!runbooks.session) {
      return null;
    }
    return runbooks.session.steps[runbooks.session.current_step] ?? null;
  }, [runbooks.session]);

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
          <Button variant="secondary" size="small" onClick={intake.onAnalyze}>
            Analyze intake
          </Button>
        </div>

        <div className="ticket-workspace-rail__subsection">
          <h4>Personalization</h4>
          <div className="ticket-workspace-rail__form">
            <label className="ticket-workspace-rail__field">
              <span>Default note audience</span>
              <select
                value={personalization.value.preferred_note_audience}
                onChange={(event) =>
                  personalization.onChange({
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
                value={personalization.value.preferred_output_length}
                onChange={(event) =>
                  personalization.onChange({
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
                value={personalization.value.default_evidence_format}
                onChange={(event) =>
                  personalization.onChange({
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
              className={`ticket-workspace-rail__chip ${intake.data.note_audience === audience.id ? "is-active" : ""}`}
              aria-pressed={intake.data.note_audience === audience.id}
              onClick={() => intake.onNoteAudienceChange(audience.id)}
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
              onClick={() => intake.onApplyPreset("incident")}
            >
              Incident
            </button>
            <button
              type="button"
              className="ticket-workspace-rail__mini-btn"
              onClick={() => intake.onApplyPreset("access")}
            >
              Access
            </button>
            <button
              type="button"
              className="ticket-workspace-rail__mini-btn"
              onClick={() => intake.onApplyPreset("rollout")}
            >
              Change
            </button>
            <button
              type="button"
              className="ticket-workspace-rail__mini-btn"
              onClick={() => intake.onApplyPreset("device")}
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
              value={
                (intake.data[field.key] as string | null | undefined) ?? ""
              }
              rows={field.rows}
              onChange={(value) => intake.onChange(field.key, value)}
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
        {nextActions.items.length === 0 ? (
          <p className="ticket-workspace-rail__empty">
            No suggested actions yet. Complete intake or generate a response
            first.
          </p>
        ) : (
          <div className="ticket-workspace-rail__stack">
            {nextActions.items.map((action) => (
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
                  onClick={() => nextActions.onAccept(action)}
                >
                  Use this action
                </Button>
              </article>
            ))}
          </div>
        )}

        {intake.missingQuestions.length > 0 && (
          <div className="ticket-workspace-rail__subsection">
            <h4>Missing questions</h4>
            <ul className="ticket-workspace-rail__questions">
              {intake.missingQuestions.map((question) => (
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
              onClick={similarCases.onRefresh}
            >
              {similarCases.loading ? "Refreshing..." : "Refresh"}
            </Button>
            <Button
              variant="secondary"
              size="small"
              disabled={
                !currentResponse.trim() || similarCases.items.length === 0
              }
              onClick={similarCases.onCompareLast}
            >
              Compare latest
            </Button>
          </div>
        </div>
        {similarCases.loading ? (
          <p className="ticket-workspace-rail__empty">
            Looking for similar solved work...
          </p>
        ) : similarCases.items.length === 0 ? (
          <p className="ticket-workspace-rail__empty">
            No similar cases yet for this ticket.
          </p>
        ) : (
          <div className="ticket-workspace-rail__stack">
            {similarCases.items.map((similarCase) => (
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
                    onClick={() => similarCases.onOpen(similarCase)}
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
                    onClick={() => similarCases.onCompare(similarCase)}
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
          <Button
            variant="secondary"
            size="small"
            onClick={packs.onCopyHandoff}
          >
            Copy pack
          </Button>
        </div>
        <div className="ticket-workspace-rail__summary-block">
          <strong>Summary</strong>
          <p>{packs.handoffPack.summary}</p>
        </div>
        <div className="ticket-workspace-rail__summary-block">
          <strong>Current blocker</strong>
          <p>{packs.handoffPack.current_blocker}</p>
        </div>
        <div className="ticket-workspace-rail__summary-block">
          <strong>Next step</strong>
          <p>{packs.handoffPack.next_step}</p>
        </div>
        <div className="ticket-workspace-rail__summary-block">
          <strong>Customer-safe update</strong>
          <p>{packs.handoffPack.customer_safe_update}</p>
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
          <Button
            variant="secondary"
            size="small"
            onClick={packs.onCopyEvidence}
          >
            Copy evidence pack
          </Button>
          <Button variant="ghost" size="small" onClick={packs.onCopyKb}>
            Copy KB draft
          </Button>
        </div>
        <div className="ticket-workspace-rail__summary-block">
          <strong>{packs.evidencePack.title}</strong>
          <p>{packs.evidencePack.summary}</p>
        </div>
        <div className="ticket-workspace-rail__summary-block">
          <strong>KB draft</strong>
          <p>{packs.kbDraft.title}</p>
          <span>{packs.kbDraft.tags.join(", ") || "No tags yet"}</span>
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
          <Button variant="secondary" size="small" onClick={kits.onSaveCurrent}>
            Save current as kit
          </Button>
        </div>
        {workspaceCatalogLoading && kits.items.length === 0 ? (
          <p className="ticket-workspace-rail__empty">Loading saved kits...</p>
        ) : kits.items.length === 0 ? (
          <p className="ticket-workspace-rail__empty">
            No saved kits yet. Save the current workspace when you solve a
            repeatable issue.
          </p>
        ) : (
          <div className="ticket-workspace-rail__stack">
            {kits.items.map((kit) => {
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
                      onClick={() => kits.onApply(kit)}
                    >
                      Apply kit
                    </Button>
                    <Button
                      variant="ghost"
                      size="small"
                      onClick={() =>
                        favorites.onToggle("kit", kit.id, kit.name, {
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
              {runbooks.templates.map((template) => (
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
            onClick={() => runbooks.onStart(selectedRunbookTemplateId)}
          >
            Start template
          </Button>
          {selectedRunbookTemplateId && (
            <Button
              variant="ghost"
              size="small"
              onClick={() => {
                const selectedTemplate = runbooks.templates.find(
                  (template) => template.id === selectedRunbookTemplateId,
                );
                if (selectedTemplate) {
                  favorites.onToggle(
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

        {!runbooks.session ? (
          <p className="ticket-workspace-rail__empty">
            No guided runbook active yet.
          </p>
        ) : (
          <div className="ticket-workspace-rail__stack">
            <article className="ticket-workspace-rail__card">
              <div className="ticket-workspace-rail__card-header">
                <strong>{runbooks.session.scenario}</strong>
                <span>{runbooks.session.status}</span>
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
                  value={runbooks.note}
                  onChange={(event) =>
                    runbooks.onNoteChange(event.target.value)
                  }
                />
              </label>
              <div className="ticket-workspace-rail__actions">
                <Button
                  variant="secondary"
                  size="small"
                  onClick={() => runbooks.onAdvance("completed")}
                >
                  Complete step
                </Button>
                <Button
                  variant="ghost"
                  size="small"
                  onClick={() => runbooks.onAdvance("skipped")}
                >
                  Skip
                </Button>
                <Button
                  variant="ghost"
                  size="small"
                  onClick={() => runbooks.onAdvance("failed")}
                >
                  Fail / pause
                </Button>
                <Button
                  variant="ghost"
                  size="small"
                  onClick={runbooks.onCopyProgress}
                >
                  Copy into notes
                </Button>
              </div>
            </article>
            <div className="ticket-workspace-rail__summary-block">
              <strong>Progress</strong>
              {runbooks.session.steps.length === 0 ? (
                <p>No steps in this runbook.</p>
              ) : (
                <ul className="ticket-workspace-rail__questions">
                  {runbooks.session.steps.map((step, index) => {
                    const session = runbooks.session!;
                    const evidence = session.evidence.find(
                      (item) => item.step_index === index,
                    );
                    const statusLabel =
                      evidence?.status ??
                      (index < session.current_step
                        ? "completed"
                        : index === session.current_step
                          ? "current"
                          : "pending");
                    return (
                      <li key={`${session.id}-${index}`}>
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
        {workspaceCatalogLoading && favorites.items.length === 0 ? (
          <p className="ticket-workspace-rail__empty">Loading favorites...</p>
        ) : favorites.items.length === 0 ? (
          <p className="ticket-workspace-rail__empty">
            No favorites yet. Favorite a runbook or resolution kit to surface it
            here.
          </p>
        ) : (
          <div className="ticket-workspace-rail__stack">
            {favorites.items.map((favorite) => {
              const matchingKit =
                favorite.kind === "kit"
                  ? kits.items.find((kit) => kit.id === favorite.resource_id)
                  : null;
              const matchingRunbook =
                favorite.kind === "runbook"
                  ? runbooks.templates.find(
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
                          kits.onApply(matchingKit);
                          return;
                        }
                        if (matchingRunbook) {
                          runbooks.onStart(matchingRunbook.id);
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
                        favorites.onToggle(
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

      {similarCases.compareCase && (
        <DiffViewer
          textA={currentResponse}
          textB={similarCases.compareCase.response_text}
          labelA="Current draft"
          labelB={similarCases.compareCase.title}
          onClose={similarCases.onCloseCompare}
        />
      )}
    </div>
  );
}
