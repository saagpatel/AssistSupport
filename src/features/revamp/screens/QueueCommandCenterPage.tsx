import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "../../../components/shared/Icon";
import { useToastContext } from "../../../contexts/ToastContext";
import { useAnalytics } from "../../../hooks/useAnalytics";
import { useDrafts } from "../../../hooks/useDrafts";
import { useQueueOps } from "../../../hooks/useQueueOps";
import type {
  CollaborationDispatchPreview,
  SavedDraft,
} from "../../../types/workspace";
import type {
  DispatchHistoryRecord,
  TriageClusterRecord,
} from "../../../types/queue";
import {
  QueueHistoryTemplatesPanel,
  type QueueHistoryTemplatesSection,
} from "./QueueHistoryTemplatesPanel";
import { resolveRevampFlags } from "../../revamp";
import {
  buildQueueHandoffSnapshot,
  buildQueueItems,
  filterQueueItems,
  formatQueueTimestamp,
  loadQueueHandoffSnapshot,
  loadQueueMeta,
  persistQueueHandoffSnapshot,
  persistQueueMeta,
  summarizeQueue,
  type QueueItem,
  type QueueMetaMap,
  type QueuePriority,
  type QueueState,
  type QueueView,
} from "../../inbox/queueModel";
import {
  buildQueueCoachingSnapshot,
  buildQueueDispatchPreview,
  buildQueueHandoffPackText,
  formatBatchTriageOutput,
  matchesQueueFocusFilter,
  parseBatchTriageInput,
  type QueueFocusFilter,
} from "../../inbox/queueCommandCenterHelpers";
import { AsButton, Badge, EmptyState, Panel, Skeleton } from "../ui";
import {
  QUEUE_OPERATOR_STORAGE_KEY,
  QUEUE_VIEW_STORAGE_KEY,
  bandLabel,
  formatTicketLabel,
  loadOperatorName,
  loadPreferredQueueView,
  truncate,
} from "./queueHelpers";
import "../../../styles/revamp/index.css";
import "./queueCommandCenter.css";

interface QueueCommandCenterPageProps {
  onLoadDraft: (draft: SavedDraft) => void;
  initialQueueView?: QueueView | null;
  onQueueViewConsumed?: () => void;
}

type QueueSection = "triage" | QueueHistoryTemplatesSection;

const QUEUE_VIEWS: Array<{ id: QueueView; label: string }> = [
  { id: "all", label: "All" },
  { id: "unassigned", label: "Unassigned" },
  { id: "at_risk", label: "At Risk" },
  { id: "in_progress", label: "In Progress" },
  { id: "resolved", label: "Resolved" },
];

const QUEUE_FOCUS_FILTERS: Array<{ id: QueueFocusFilter; label: string }> = [
  { id: "all", label: "All tickets" },
  { id: "policy-heavy", label: "Policy heavy" },
  { id: "approval-heavy", label: "Approval heavy" },
  { id: "repeated-incidents", label: "Repeated incidents" },
  { id: "missing-context", label: "Missing context" },
];

const DISPATCH_TARGETS: CollaborationDispatchPreview["integration_type"][] = [
  "jira",
  "servicenow",
  "slack",
  "teams",
];

export function QueueCommandCenterPage({
  onLoadDraft,
  initialQueueView = null,
  onQueueViewConsumed,
}: QueueCommandCenterPageProps) {
  const { success: showSuccess, error: showError } = useToastContext();
  const { logEvent } = useAnalytics();
  const draftStore = useDrafts();
  const {
    drafts,
    templates,
    loading,
    error: draftsError,
    loadDrafts,
    searchDrafts,
    loadTemplates,
    deleteDraft,
    saveTemplate,
    updateTemplate,
    deleteTemplate,
    getDraft,
    getDraftVersions,
    restoreDraftVersion,
    computeInputHash,
  } = draftStore;
  const {
    clusterTicketsForTriage,
    listRecentTriageClusters,
    previewCollaborationDispatch,
    confirmCollaborationDispatch,
    cancelCollaborationDispatch,
    listDispatchHistory,
  } = useQueueOps();
  const queueFlags = useMemo(() => resolveRevampFlags(), []);
  const [queueMetaMap, setQueueMetaMap] = useState<QueueMetaMap>(() =>
    loadQueueMeta(),
  );
  const [previousHandoffSnapshot, setPreviousHandoffSnapshot] = useState(() =>
    loadQueueHandoffSnapshot(),
  );
  const [queueView, setQueueView] = useState<QueueView>(loadPreferredQueueView);
  const [queueSection, setQueueSection] = useState<QueueSection>("triage");
  const [queueFocusFilter, setQueueFocusFilter] =
    useState<QueueFocusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [operatorName, setOperatorName] = useState(loadOperatorName);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [batchTriageInput, setBatchTriageInput] = useState("");
  const [batchTriageOutput, setBatchTriageOutput] = useState("");
  const [batchTriageBusy, setBatchTriageBusy] = useState(false);
  const [triageHistory, setTriageHistory] = useState<TriageClusterRecord[]>([]);
  const [handoffStatus, setHandoffStatus] = useState<string | null>(null);
  const [dispatchTarget, setDispatchTarget] =
    useState<CollaborationDispatchPreview["integration_type"]>("jira");
  const [dispatchPreview, setDispatchPreview] =
    useState<CollaborationDispatchPreview | null>(null);
  const [dispatchHistory, setDispatchHistory] = useState<
    DispatchHistoryRecord[]
  >([]);
  const [pendingDispatchId, setPendingDispatchId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    loadDrafts(100);
  }, [loadDrafts]);

  useEffect(() => {
    listRecentTriageClusters(20)
      .then(setTriageHistory)
      .catch(() => setTriageHistory([]));
  }, [listRecentTriageClusters]);

  useEffect(() => {
    if (!queueFlags.ASSISTSUPPORT_COLLABORATION_DISPATCH) {
      setDispatchHistory([]);
      return;
    }

    listDispatchHistory(20)
      .then(setDispatchHistory)
      .catch(() => setDispatchHistory([]));
  }, [queueFlags.ASSISTSUPPORT_COLLABORATION_DISPATCH, listDispatchHistory]);

  useEffect(() => {
    if (!initialQueueView) return;
    setQueueSection("triage");
    setQueueView(initialQueueView);
    onQueueViewConsumed?.();
  }, [initialQueueView, onQueueViewConsumed]);

  useEffect(() => {
    try {
      localStorage.setItem(QUEUE_OPERATOR_STORAGE_KEY, operatorName);
    } catch {
      // Keep queue workflows usable even if storage is restricted.
    }
  }, [operatorName]);

  useEffect(() => {
    try {
      localStorage.setItem(QUEUE_VIEW_STORAGE_KEY, queueView);
    } catch {
      // Keep queue workflows usable even if storage is restricted.
    }
  }, [queueView]);

  const queueItems = useMemo(
    () => buildQueueItems(drafts, queueMetaMap),
    [drafts, queueMetaMap],
  );
  const followUpsDataSource = useMemo(
    () => ({
      drafts,
      templates,
      loading,
      loadDrafts,
      searchDrafts,
      loadTemplates,
      deleteDraft,
      saveTemplate,
      updateTemplate,
      deleteTemplate,
      getDraft,
      getDraftVersions,
      restoreDraftVersion,
      computeInputHash,
    }),
    [
      computeInputHash,
      deleteDraft,
      deleteTemplate,
      drafts,
      getDraft,
      getDraftVersions,
      loadDrafts,
      loadTemplates,
      loading,
      restoreDraftVersion,
      saveTemplate,
      searchDrafts,
      templates,
      updateTemplate,
    ],
  );
  const queueSummary = useMemo(() => summarizeQueue(queueItems), [queueItems]);
  const queueCoaching = useMemo(
    () => buildQueueCoachingSnapshot(queueItems, triageHistory),
    [queueItems, triageHistory],
  );
  const queueHandoffSnapshot = useMemo(
    () => buildQueueHandoffSnapshot(queueItems),
    [queueItems],
  );
  const queueHandoffPackText = useMemo(
    () =>
      buildQueueHandoffPackText(queueHandoffSnapshot, previousHandoffSnapshot),
    [queueHandoffSnapshot, previousHandoffSnapshot],
  );

  const filteredItems = useMemo(() => {
    const scoped = filterQueueItems(queueItems, queueView);
    const focused = scoped.filter((item) =>
      matchesQueueFocusFilter(item, queueFocusFilter, triageHistory),
    );
    const q = searchQuery.trim().toLowerCase();
    if (!q) return focused;
    return focused.filter((item) => {
      const ticket = item.draft.ticket_id?.toLowerCase() ?? "";
      const summary = item.draft.summary_text?.toLowerCase() ?? "";
      const input = item.draft.input_text.toLowerCase();
      return ticket.includes(q) || summary.includes(q) || input.includes(q);
    });
  }, [queueItems, queueView, queueFocusFilter, triageHistory, searchQuery]);

  useEffect(() => {
    setSelectedIndex((prev) => {
      if (filteredItems.length === 0) return 0;
      return Math.max(0, Math.min(prev, filteredItems.length - 1));
    });
  }, [filteredItems]);

  const updateQueueMeta = useCallback(
    (
      draftId: string,
      updates: Partial<{
        owner: string;
        state: QueueState;
        priority: QueuePriority;
      }>,
    ) => {
      setQueueMetaMap((prev) => {
        const existing = prev[draftId] ?? {
          owner: "unassigned",
          state: "open" as QueueState,
          priority: "normal" as QueuePriority,
          updatedAt: new Date().toISOString(),
        };

        const next: QueueMetaMap = {
          ...prev,
          [draftId]: {
            ...existing,
            ...updates,
            updatedAt: new Date().toISOString(),
          },
        };

        persistQueueMeta(next);
        return next;
      });
    },
    [],
  );

  const handleClaim = useCallback(
    (draftId: string) => {
      updateQueueMeta(draftId, { owner: operatorName, state: "in_progress" });
      void logEvent("queue_item_claimed", {
        draft_id: draftId,
        operator: operatorName,
      });
    },
    [logEvent, operatorName, updateQueueMeta],
  );

  const handleResolve = useCallback(
    (draftId: string) => {
      updateQueueMeta(draftId, { state: "resolved" });
      void logEvent("queue_item_resolved", {
        draft_id: draftId,
        operator: operatorName,
      });
    },
    [logEvent, operatorName, updateQueueMeta],
  );

  const handleReopen = useCallback(
    (draftId: string) => {
      updateQueueMeta(draftId, { state: "open" });
      void logEvent("queue_item_reopened", {
        draft_id: draftId,
        operator: operatorName,
      });
    },
    [logEvent, operatorName, updateQueueMeta],
  );

  const handlePriorityChange = useCallback(
    (draftId: string, priority: QueuePriority) => {
      updateQueueMeta(draftId, { priority });
      void logEvent("queue_item_priority_changed", {
        draft_id: draftId,
        operator: operatorName,
        priority,
      });
    },
    [logEvent, operatorName, updateQueueMeta],
  );

  const currentItem = filteredItems[selectedIndex] ?? null;

  const withCurrentItem = useCallback(
    (handler: (item: QueueItem) => void) => {
      if (!currentItem) return;
      handler(currentItem);
    },
    [currentItem],
  );

  const refreshTriageHistory = useCallback(async () => {
    const next = await listRecentTriageClusters(20).catch(() => []);
    setTriageHistory(next);
  }, [listRecentTriageClusters]);

  const handleSeedBatchTriage = useCallback(() => {
    const nextInput = filteredItems
      .slice(0, 25)
      .map(
        (item) =>
          `${formatTicketLabel(item.draft)}|${item.draft.summary_text || item.draft.input_text}`,
      )
      .join("\n");
    setBatchTriageInput(nextInput);
  }, [filteredItems]);

  const handleRunBatchTriage = useCallback(async () => {
    const tickets = parseBatchTriageInput(batchTriageInput);
    if (tickets.length === 0) {
      showError("Add at least one ticket before running batch triage");
      return;
    }

    setBatchTriageBusy(true);
    try {
      const clusters = await clusterTicketsForTriage(tickets);
      setBatchTriageOutput(formatBatchTriageOutput(clusters));
      await refreshTriageHistory();
      void logEvent("queue_batch_triage_ran", {
        operator: operatorName,
        ticket_count: tickets.length,
        cluster_count: clusters.length,
      });
      showSuccess("Batch triage completed");
    } catch (error) {
      showError(`Batch triage failed: ${error}`);
    } finally {
      setBatchTriageBusy(false);
    }
  }, [
    batchTriageInput,
    clusterTicketsForTriage,
    refreshTriageHistory,
    logEvent,
    operatorName,
    showSuccess,
    showError,
  ]);

  const handleCopyHandoffPack = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      setHandoffStatus("Clipboard not available in this environment.");
      return;
    }

    try {
      await navigator.clipboard.writeText(queueHandoffPackText);
      persistQueueHandoffSnapshot(queueHandoffSnapshot);
      setPreviousHandoffSnapshot(queueHandoffSnapshot);
      setHandoffStatus("Shift handoff pack copied.");
      void logEvent("queue_handoff_pack_copied", {
        operator: operatorName,
        queue_view: queueView,
        at_risk: queueHandoffSnapshot.summary.atRisk,
      });
      showSuccess("Shift handoff pack copied");
    } catch {
      setHandoffStatus("Failed to copy shift handoff pack.");
      showError("Failed to copy shift handoff pack");
    }
  }, [
    queueHandoffPackText,
    queueHandoffSnapshot,
    logEvent,
    operatorName,
    queueView,
    showSuccess,
    showError,
  ]);

  const handlePreviewDispatch = useCallback(() => {
    if (!currentItem) {
      showError("Select a work item before previewing a dispatch");
      return;
    }

    const preview = buildQueueDispatchPreview(currentItem, dispatchTarget);
    void previewCollaborationDispatch({
      integrationType: preview.integration_type,
      draftId: currentItem.draft.id,
      title: preview.title,
      destinationLabel: preview.destination_label,
      payloadPreview: preview.payload_preview,
      metadataJson: JSON.stringify({
        operator: operatorName,
        ticket_id: currentItem.draft.ticket_id,
      }),
    })
      .then(async (record) => {
        setDispatchPreview(preview);
        setPendingDispatchId(record.id);
        setDispatchHistory(await listDispatchHistory(20).catch(() => []));
        void logEvent("queue_dispatch_previewed", {
          operator: operatorName,
          draft_id: currentItem.draft.id,
          integration_type: dispatchTarget,
        });
      })
      .catch((error) => {
        showError(`Could not preview dispatch: ${error}`);
      });
  }, [
    currentItem,
    dispatchTarget,
    operatorName,
    previewCollaborationDispatch,
    listDispatchHistory,
    logEvent,
    showError,
  ]);

  const handleSendDispatch = useCallback(async () => {
    if (!pendingDispatchId || !dispatchPreview) {
      showError("Preview a dispatch before confirming delivery");
      return;
    }

    try {
      const record = await confirmCollaborationDispatch(pendingDispatchId);
      setDispatchHistory(await listDispatchHistory(20).catch(() => []));
      setDispatchPreview(null);
      setPendingDispatchId(null);
      void logEvent("queue_dispatch_sent", {
        operator: operatorName,
        integration_type: record.integration_type,
        dispatch_id: record.id,
      });
      showSuccess(`${record.destination_label} dispatch confirmed as sent`);
    } catch (error) {
      showError(`Failed to confirm dispatch: ${error}`);
    }
  }, [
    pendingDispatchId,
    dispatchPreview,
    confirmCollaborationDispatch,
    listDispatchHistory,
    logEvent,
    operatorName,
    showSuccess,
    showError,
  ]);

  const handleCancelDispatch = useCallback(async () => {
    if (!pendingDispatchId) {
      setDispatchPreview(null);
      return;
    }

    try {
      await cancelCollaborationDispatch(pendingDispatchId);
      setDispatchHistory(await listDispatchHistory(20).catch(() => []));
      setDispatchPreview(null);
      setPendingDispatchId(null);
      showSuccess("Dispatch preview cancelled");
    } catch (error) {
      showError(`Failed to cancel dispatch: ${error}`);
    }
  }, [
    pendingDispatchId,
    cancelCollaborationDispatch,
    listDispatchHistory,
    showSuccess,
    showError,
  ]);

  const handleQueueKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      const target = event.target as HTMLElement;
      const isInputElement =
        target.tagName === "INPUT" ||
        target.tagName === "SELECT" ||
        target.tagName === "TEXTAREA";
      if (isInputElement) return;

      switch (event.key.toLowerCase()) {
        case "arrowdown":
        case "j":
          event.preventDefault();
          setSelectedIndex((prev) =>
            Math.min(prev + 1, Math.max(filteredItems.length - 1, 0)),
          );
          break;
        case "arrowup":
        case "k":
          event.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case "enter":
          event.preventDefault();
          withCurrentItem((item) => {
            onLoadDraft(item.draft);
            void logEvent("queue_item_opened", {
              draft_id: item.draft.id,
              operator: operatorName,
              entrypoint: "keyboard",
            });
          });
          break;
        case "c":
          event.preventDefault();
          withCurrentItem((item) => {
            if (
              item.meta.owner === "unassigned" &&
              item.meta.state !== "resolved"
            ) {
              handleClaim(item.draft.id);
            }
          });
          break;
        case "x":
          event.preventDefault();
          withCurrentItem((item) => {
            if (item.meta.state !== "resolved") {
              handleResolve(item.draft.id);
            }
          });
          break;
        case "o":
          event.preventDefault();
          withCurrentItem((item) => {
            if (item.meta.state === "resolved") {
              handleReopen(item.draft.id);
            }
          });
          break;
        default:
          break;
      }
    },
    [
      filteredItems.length,
      handleClaim,
      handleReopen,
      handleResolve,
      logEvent,
      onLoadDraft,
      operatorName,
      withCurrentItem,
    ],
  );

  const listActions = (
    <div className="as-queue__count" aria-label="Visible work item count">
      {loading ? "Loading…" : `${filteredItems.length} shown`}
    </div>
  );

  const listContent = (
    <Panel
      title="Work Items"
      subtitle="Keyboard triage: J/K move · C claim · X resolve · O reopen · Enter open"
      actions={listActions}
    >
      {loading && <Skeleton lines={6} />}
      {!loading && draftsError && (
        <div className="as-queue__errorState">
          <EmptyState
            title="Queue unavailable"
            description="Drafts could not be loaded. Retry, or switch back to Draft to continue working offline."
            icon={<Icon name="alert-triangle" size={18} />}
          />
          <div className="as-queue__errorActions">
            <AsButton
              tone="primary"
              size="small"
              onClick={() => {
                loadDrafts(100);
              }}
            >
              Retry Load
            </AsButton>
          </div>
        </div>
      )}
      {!loading && filteredItems.length === 0 && (
        <EmptyState
          title="No work items in this view"
          description="Try switching views, clearing search, or creating a new draft from Intake."
          icon={<Icon name="list" size={18} />}
        />
      )}
      {!loading && filteredItems.length > 0 && (
        <ul
          data-testid="queue-items-list"
          tabIndex={0}
          role="listbox"
          aria-label="Work items"
          aria-activedescendant={
            currentItem ? `as-queue-item-${currentItem.draft.id}` : undefined
          }
          className="as-queue__items"
        >
          {filteredItems.map((item, index) => {
            const prev = filteredItems[index - 1] ?? null;
            const label = bandLabel(item);
            const prevLabel = prev ? bandLabel(prev) : null;
            const showSection = index === 0 || label !== prevLabel;
            const selected = selectedIndex === index;

            return (
              <li key={item.draft.id}>
                {showSection && (
                  <div className="as-queue__sectionLabel">{label}</div>
                )}
                <div
                  id={`as-queue-item-${item.draft.id}`}
                  role="option"
                  aria-selected={selected}
                  className={["as-queue__item", selected ? "is-selected" : ""]
                    .filter(Boolean)
                    .join(" ")}
                  data-selected={selected ? "true" : "false"}
                  onClick={() => setSelectedIndex(index)}
                >
                  <div className="as-queue__itemTop">
                    <div>
                      <div className="as-queue__ticket">
                        {formatTicketLabel(item.draft)}
                      </div>
                      <p className="as-queue__summary">
                        {truncate(
                          item.draft.summary_text || item.draft.input_text,
                          140,
                        )}
                      </p>
                    </div>
                    <div className="as-queue__badges">
                      <Badge
                        tone={
                          item.isAtRisk
                            ? "bad"
                            : item.meta.priority === "urgent"
                              ? "warn"
                              : "neutral"
                        }
                      >
                        {item.meta.priority}
                      </Badge>
                      <Badge
                        tone={
                          item.meta.state === "resolved"
                            ? "info"
                            : item.meta.state === "in_progress"
                              ? "good"
                              : "neutral"
                        }
                      >
                        {item.meta.state.replace("_", " ")}
                      </Badge>
                      {item.isAtRisk && <Badge tone="bad">at risk</Badge>}
                    </div>
                  </div>

                  <div className="as-queue__metaRow">
                    <span>Owner: {item.meta.owner}</span>
                    <span>SLA due: {formatQueueTimestamp(item.slaDueAt)}</span>
                    <span>
                      Updated: {formatQueueTimestamp(item.meta.updatedAt)}
                    </span>
                  </div>

                  <div className="as-queue__actions">
                    <AsButton
                      tone="primary"
                      size="small"
                      onClick={() => {
                        onLoadDraft(item.draft);
                        void logEvent("queue_item_opened", {
                          draft_id: item.draft.id,
                          operator: operatorName,
                          entrypoint: "button",
                        });
                      }}
                    >
                      Open Draft
                    </AsButton>
                    {item.meta.owner === "unassigned" &&
                      item.meta.state !== "resolved" && (
                        <AsButton
                          size="small"
                          onClick={() => handleClaim(item.draft.id)}
                        >
                          Claim
                        </AsButton>
                      )}
                    {item.meta.state !== "resolved" ? (
                      <AsButton
                        tone="ghost"
                        size="small"
                        onClick={() => handleResolve(item.draft.id)}
                      >
                        Resolve
                      </AsButton>
                    ) : (
                      <AsButton
                        tone="ghost"
                        size="small"
                        onClick={() => handleReopen(item.draft.id)}
                      >
                        Reopen
                      </AsButton>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );

  const insightsContent = (
    <div className="as-queue__insights" aria-label="Queue insights">
      <Panel
        title="Team Scorecard"
        subtitle="Queue coaching for recurring issues, ownership risk, and missing context"
        actions={
          <Badge
            tone={
              queueCoaching.score >= 85
                ? "good"
                : queueCoaching.score >= 70
                  ? "warn"
                  : "bad"
            }
          >
            {queueCoaching.score}/100
          </Badge>
        }
      >
        <p className="as-queue__insightSummary">{queueCoaching.summary}</p>
        <div className="as-queue__coachMetrics">
          <div>
            <span>Repeated incidents</span>
            <strong>{queueCoaching.repeatedIncidentCount}</strong>
          </div>
          <div>
            <span>Policy heavy</span>
            <strong>{queueCoaching.policyHeavyCount}</strong>
          </div>
          <div>
            <span>Approval heavy</span>
            <strong>{queueCoaching.approvalHeavyCount}</strong>
          </div>
          <div>
            <span>Missing context</span>
            <strong>{queueCoaching.missingContextCount}</strong>
          </div>
        </div>
        {queueCoaching.signals.length > 0 ? (
          <ul className="as-queue__signalList">
            {queueCoaching.signals.map((signal) => (
              <li key={signal.id}>
                <strong>{signal.label}</strong>
                <span>{signal.detail}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="as-queue__insightHint">
            No major queue coaching signals right now.
          </p>
        )}
        {queueCoaching.topOwners.length > 0 && (
          <div className="as-queue__ownerLoad">
            <div className="as-queue__label">Top active owners</div>
            <ul className="as-queue__signalList">
              {queueCoaching.topOwners.map((owner) => (
                <li key={owner.owner}>
                  <strong>{owner.owner}</strong>
                  <span>
                    {owner.openCount} open · {owner.inProgressCount} in progress
                    · {owner.atRiskCount} at risk
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Panel>

      {queueFlags.ASSISTSUPPORT_BATCH_TRIAGE && (
        <Panel
          title="Batch Triage"
          subtitle="Paste or seed tickets, cluster them, and surface repeated issue families"
          actions={
            <div className="as-queue__panelActions">
              <AsButton
                tone="ghost"
                size="small"
                onClick={handleSeedBatchTriage}
              >
                Use visible queue
              </AsButton>
              <AsButton
                tone="primary"
                size="small"
                onClick={handleRunBatchTriage}
              >
                {batchTriageBusy ? "Running…" : "Run triage"}
              </AsButton>
            </div>
          }
        >
          <textarea
            className="as-queue__textarea"
            placeholder="INC-1001|VPN outage for west region"
            value={batchTriageInput}
            onChange={(event) => setBatchTriageInput(event.target.value)}
            aria-label="Batch triage input"
          />
          {batchTriageOutput ? (
            <pre className="as-queue__pre">{batchTriageOutput}</pre>
          ) : (
            <p className="as-queue__insightHint">
              No triage output yet. Seed from the visible queue or paste tickets
              manually.
            </p>
          )}
          {triageHistory.length > 0 && (
            <div className="as-queue__history">
              <div className="as-queue__label">Recent clusters</div>
              <ul className="as-queue__signalList">
                {triageHistory.slice(0, 3).map((cluster) => (
                  <li key={cluster.id}>
                    <strong>{cluster.cluster_key}</strong>
                    <span>
                      {cluster.summary} · {cluster.ticket_count} tickets
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>
      )}
    </div>
  );

  const detailContent = (
    <div className="as-queue__detail">
      <div className="as-queue__detailStack">
        <Panel
          title="Selected Item"
          subtitle={
            currentItem
              ? "Preview + quick edits"
              : "Select a work item to preview"
          }
        >
          {!currentItem ? (
            <EmptyState
              title="No selection"
              description="Use J/K or click an item, then Enter to open it in Draft."
              icon={<Icon name="search" size={18} />}
            />
          ) : (
            <>
              <h3 className="as-queue__detailTitle">
                {formatTicketLabel(currentItem.draft)}
              </h3>
              <p className="as-queue__detailText">
                {currentItem.draft.summary_text ||
                  truncate(currentItem.draft.input_text, 260)}
              </p>

              <div className="as-queue__detailGrid">
                <div>
                  <div className="as-queue__label">Owner</div>
                  <div>{currentItem.meta.owner}</div>
                </div>
                <div>
                  <div className="as-queue__label">SLA due</div>
                  <div>{formatQueueTimestamp(currentItem.slaDueAt)}</div>
                </div>
                <div>
                  <div className="as-queue__label">Priority</div>
                  <select
                    className="as-queue__select"
                    value={currentItem.meta.priority}
                    onChange={(event) =>
                      handlePriorityChange(
                        currentItem.draft.id,
                        event.target.value as QueuePriority,
                      )
                    }
                  >
                    <option value="low">low</option>
                    <option value="normal">normal</option>
                    <option value="high">high</option>
                    <option value="urgent">urgent</option>
                  </select>
                </div>
              </div>

              <div className="as-queue__actions">
                <AsButton
                  tone="primary"
                  onClick={() => {
                    onLoadDraft(currentItem.draft);
                    void logEvent("queue_item_opened", {
                      draft_id: currentItem.draft.id,
                      operator: operatorName,
                      entrypoint: "preview",
                    });
                  }}
                >
                  Open In Draft
                </AsButton>
                {currentItem.meta.owner === "unassigned" &&
                  currentItem.meta.state !== "resolved" && (
                    <AsButton onClick={() => handleClaim(currentItem.draft.id)}>
                      Claim
                    </AsButton>
                  )}
                {currentItem.meta.state !== "resolved" ? (
                  <AsButton
                    tone="ghost"
                    onClick={() => handleResolve(currentItem.draft.id)}
                  >
                    Resolve
                  </AsButton>
                ) : (
                  <AsButton
                    tone="ghost"
                    onClick={() => handleReopen(currentItem.draft.id)}
                  >
                    Reopen
                  </AsButton>
                )}
              </div>
            </>
          )}
        </Panel>

        <Panel
          title="Shift Handoff"
          subtitle="Copy a clean shift summary with owner load, deltas, and the top at-risk work"
          actions={
            <AsButton
              tone="primary"
              size="small"
              onClick={handleCopyHandoffPack}
            >
              Copy handoff
            </AsButton>
          }
        >
          <pre className="as-queue__pre as-queue__pre--compact">
            {queueHandoffPackText}
          </pre>
          {handoffStatus && <p className="as-queue__status">{handoffStatus}</p>}
        </Panel>

        {queueFlags.ASSISTSUPPORT_COLLABORATION_DISPATCH && (
          <Panel
            title="Dispatch Preview"
            subtitle="Preview collaboration payloads before handing work off to external systems"
          >
            <div className="as-queue__dispatchControls">
              <label className="as-queue__field">
                <span>Destination</span>
                <select
                  className="as-queue__select"
                  value={dispatchTarget}
                  onChange={(event) =>
                    setDispatchTarget(
                      event.target
                        .value as CollaborationDispatchPreview["integration_type"],
                    )
                  }
                >
                  {DISPATCH_TARGETS.map((target) => (
                    <option key={target} value={target}>
                      {target}
                    </option>
                  ))}
                </select>
              </label>
              <div className="as-queue__actions">
                <AsButton
                  tone="primary"
                  size="small"
                  onClick={handlePreviewDispatch}
                >
                  Preview payload
                </AsButton>
                {dispatchPreview && (
                  <>
                    <AsButton size="small" onClick={handleSendDispatch}>
                      Confirm sent
                    </AsButton>
                    <AsButton
                      tone="ghost"
                      size="small"
                      onClick={handleCancelDispatch}
                    >
                      Cancel
                    </AsButton>
                  </>
                )}
              </div>
            </div>

            {dispatchPreview ? (
              <>
                <div className="as-queue__dispatchMeta">
                  <strong>{dispatchPreview.destination_label}</strong>
                  <span>{dispatchPreview.title}</span>
                </div>
                <pre className="as-queue__pre as-queue__pre--compact">
                  {dispatchPreview.payload_preview}
                </pre>
              </>
            ) : (
              <p className="as-queue__insightHint">
                Select a ticket, choose a destination, and preview the outbound
                payload here.
              </p>
            )}

            {dispatchHistory.length > 0 && (
              <div className="as-queue__history">
                <div className="as-queue__label">Recent dispatch history</div>
                <ul className="as-queue__signalList">
                  {dispatchHistory.slice(0, 3).map((entry) => (
                    <li key={entry.id}>
                      <strong>{entry.destination_label}</strong>
                      <span>
                        {entry.title} · {entry.status} ·{" "}
                        {formatQueueTimestamp(entry.created_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Panel>
        )}
      </div>
    </div>
  );

  return (
    <div
      className="as-queue"
      data-testid="queue-first-inbox"
      onKeyDown={queueSection === "triage" ? handleQueueKeyDown : undefined}
    >
      <div className="as-queue__header">
        <div>
          <h2 className="as-queue__title">Queue Command Center</h2>
          <p className="as-queue__subtitle">
            Local-only queue triage. Open drafts, claim ownership, and resolve
            work without losing context.
          </p>
        </div>
        <div
          className="as-queue__operator"
          aria-label="Queue operator settings"
        >
          <div className="as-queue__label">Operator</div>
          <input
            className="as-queue__input"
            value={operatorName}
            onChange={(event) =>
              setOperatorName(event.target.value || "current-operator")
            }
            maxLength={64}
            aria-label="Operator name"
          />
        </div>
      </div>

      <div className="as-queue__controls" aria-label="Queue sections">
        <div
          className="as-queue__viewButtons"
          role="tablist"
          aria-label="Queue sections"
        >
          <AsButton
            tone={queueSection === "triage" ? "primary" : "ghost"}
            size="small"
            onClick={() => setQueueSection("triage")}
          >
            Triage
          </AsButton>
          <AsButton
            tone={queueSection === "history" ? "primary" : "ghost"}
            size="small"
            onClick={() => setQueueSection("history")}
          >
            History
          </AsButton>
          <AsButton
            tone={queueSection === "templates" ? "primary" : "ghost"}
            size="small"
            onClick={() => setQueueSection("templates")}
          >
            Templates
          </AsButton>
        </div>
      </div>

      <div className="as-queue__metrics" aria-label="Queue summary metrics">
        <Panel>
          <div className="as-queue__metricKey">Total</div>
          <div className="as-queue__metricVal">{queueSummary.total}</div>
        </Panel>
        <Panel>
          <div className="as-queue__metricKey">Unassigned</div>
          <div className="as-queue__metricVal">{queueSummary.unassigned}</div>
        </Panel>
        <Panel>
          <div className="as-queue__metricKey">In Progress</div>
          <div className="as-queue__metricVal">{queueSummary.inProgress}</div>
        </Panel>
        <Panel>
          <div className="as-queue__metricKey">At Risk</div>
          <div className="as-queue__metricVal">{queueSummary.atRisk}</div>
        </Panel>
      </div>

      {queueSection === "triage" ? (
        <>
          <div className="as-queue__controls" aria-label="Queue controls">
            <div className="as-queue__controlGroups">
              <div
                className="as-queue__viewButtons"
                role="group"
                aria-label="Queue views"
              >
                {QUEUE_VIEWS.map((view) => (
                  <AsButton
                    key={view.id}
                    tone={queueView === view.id ? "primary" : "ghost"}
                    size="small"
                    onClick={() => {
                      setQueueView(view.id);
                      void logEvent("queue_view_changed", {
                        queue_view: view.id,
                        operator: operatorName,
                      });
                    }}
                  >
                    {view.label}
                  </AsButton>
                ))}
              </div>

              <div
                className="as-queue__viewButtons"
                role="group"
                aria-label="Queue focus filters"
              >
                {QUEUE_FOCUS_FILTERS.map((filter) => (
                  <AsButton
                    key={filter.id}
                    tone={queueFocusFilter === filter.id ? "primary" : "ghost"}
                    size="small"
                    onClick={() => {
                      setQueueFocusFilter(filter.id);
                      void logEvent("queue_focus_filter_changed", {
                        queue_focus_filter: filter.id,
                        operator: operatorName,
                      });
                    }}
                  >
                    {filter.label}
                  </AsButton>
                ))}
              </div>
            </div>

            <input
              className={["as-queue__input", "as-queue__search"].join(" ")}
              placeholder="Search queue, ticket, or resolution..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              aria-label="Search queue"
            />
          </div>

          <div className="as-queue__insightsGrid">{insightsContent}</div>

          <div className="as-queue__grid" aria-label="Queue workspace">
            <div className="as-queue__list">{listContent}</div>
            {detailContent}
          </div>
        </>
      ) : (
        <Panel
          title={queueSection === "history" ? "Draft History" : "Templates"}
          subtitle={
            queueSection === "history"
              ? "Search saved drafts, inspect version history, and reopen work in the workspace."
              : "Manage reusable templates without leaving Queue."
          }
        >
          <QueueHistoryTemplatesPanel
            dataSource={followUpsDataSource}
            activeSection={queueSection}
            onActiveSectionChange={setQueueSection}
            hideSectionTabs
            onLoadDraft={onLoadDraft}
          />
        </Panel>
      )}
    </div>
  );
}
