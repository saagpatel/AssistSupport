import type {
  TriageClusterOutput,
  TriageTicketInput,
} from "../../hooks/useQueueOps";
import type {
  DispatchHistoryRecord,
  TriageClusterRecord,
} from "../../types/queue";
import type {
  CollaborationDispatchPreview,
  SavedDraft,
} from "../../types/workspace";
import { parseCaseIntake } from "../workspace/workspaceAssistant";
import {
  buildQueueHandoffDelta,
  formatQueueTimestamp,
  summarizeQueue,
  summarizeQueueByOwner,
  type QueueHandoffSnapshot,
  type QueueItem,
} from "./queueModel";

export type QueueFocusFilter =
  | "all"
  | "policy-heavy"
  | "approval-heavy"
  | "repeated-incidents"
  | "missing-context";

export interface QueueCoachingSignal {
  id: string;
  label: string;
  detail: string;
  severity: "info" | "watch" | "action";
}

export interface QueueCoachingSnapshot {
  score: number;
  summary: string;
  policyHeavyCount: number;
  approvalHeavyCount: number;
  repeatedIncidentCount: number;
  missingContextCount: number;
  topOwners: ReturnType<typeof summarizeQueueByOwner>;
  signals: QueueCoachingSignal[];
}

export interface QueueDispatchHistoryEntry extends Omit<
  DispatchHistoryRecord,
  "draft_id" | "metadata_json" | "status" | "updated_at"
> {
  draft_id: string;
  ticket_label: string;
}

const POLICY_REGEX =
  /\b(policy|security|forbidden|allowed|compliance|governance|approval|approve|access request)\b/i;
const APPROVAL_REGEX =
  /\b(approval|approve|approver|manager approval|sign-off|entitlement|access request)\b/i;
const REPEATED_REGEX =
  /\b(repeat|recurr|again|every morning|same issue|same problem|intermittent)\b/i;
const DISPATCH_HISTORY_STORAGE_KEY = "assistsupport.queue.dispatch-history.v1";

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function tokenize(value: string): string[] {
  return Array.from(
    new Set(
      value
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .map((token) => token.trim())
        .filter((token) => token.length > 2),
    ),
  );
}

function getDraftSearchText(draft: SavedDraft): string {
  return [
    draft.ticket_id,
    draft.summary_text,
    draft.input_text,
    draft.response_text,
    draft.handoff_summary,
  ]
    .filter(Boolean)
    .join(" ");
}

function matchesRepeatedCluster(
  draft: SavedDraft,
  triageHistory: TriageClusterRecord[],
): boolean {
  const draftTokens = tokenize(getDraftSearchText(draft));
  if (draftTokens.length === 0) {
    return false;
  }

  return triageHistory.some((cluster) => {
    if (cluster.ticket_count < 2) {
      return false;
    }
    const clusterTokens = tokenize(cluster.summary);
    const shared = clusterTokens.filter((token) => draftTokens.includes(token));
    return shared.length >= 2;
  });
}

function getMissingContextCount(draft: SavedDraft): number {
  const intake = parseCaseIntake(draft.case_intake_json);
  return Array.isArray(intake.missing_data) ? intake.missing_data.length : 0;
}

function buildScore(
  summary: ReturnType<typeof summarizeQueue>,
  signals: QueueCoachingSignal[],
): number {
  const penalty = signals.reduce((sum, signal) => {
    if (signal.severity === "action") {
      return sum + 16;
    }
    if (signal.severity === "watch") {
      return sum + 8;
    }
    return sum + 2;
  }, 0);
  const riskPenalty = summary.atRisk * 3 + summary.unassigned * 2;
  return Math.max(0, Math.min(100, 100 - penalty - riskPenalty));
}

export function parseBatchTriageInput(input: string): TriageTicketInput[] {
  return input
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const [id, summary] = line.split("|").map((value) => value?.trim());
      if (summary) {
        return {
          id: id || `ticket-${index + 1}`,
          summary,
        };
      }

      return {
        id: `ticket-${index + 1}`,
        summary: line,
      };
    });
}

export function formatBatchTriageOutput(
  clusters: TriageClusterOutput[],
): string {
  if (clusters.length === 0) {
    return "No triage clusters produced.";
  }

  return clusters
    .map((cluster) => {
      return [
        `${cluster.cluster_key}: ${cluster.summary}`,
        `Tickets: ${cluster.ticket_ids.join(", ")}`,
      ].join("\n");
    })
    .join("\n\n");
}

export function matchesQueueFocusFilter(
  item: QueueItem,
  filter: QueueFocusFilter,
  triageHistory: TriageClusterRecord[] = [],
): boolean {
  if (filter === "all") {
    return true;
  }

  const haystack = getDraftSearchText(item.draft);

  if (filter === "policy-heavy") {
    return POLICY_REGEX.test(haystack);
  }

  if (filter === "approval-heavy") {
    return APPROVAL_REGEX.test(haystack);
  }

  if (filter === "repeated-incidents") {
    return (
      REPEATED_REGEX.test(haystack) ||
      matchesRepeatedCluster(item.draft, triageHistory)
    );
  }

  return getMissingContextCount(item.draft) > 0;
}

export function buildQueueCoachingSnapshot(
  items: QueueItem[],
  triageHistory: TriageClusterRecord[] = [],
): QueueCoachingSnapshot {
  const summary = summarizeQueue(items);
  const topOwners = summarizeQueueByOwner(items).slice(0, 3);
  const policyHeavyCount = items.filter((item) =>
    matchesQueueFocusFilter(item, "policy-heavy", triageHistory),
  ).length;
  const approvalHeavyCount = items.filter((item) =>
    matchesQueueFocusFilter(item, "approval-heavy", triageHistory),
  ).length;
  const repeatedIncidentCount = items.filter((item) =>
    matchesQueueFocusFilter(item, "repeated-incidents", triageHistory),
  ).length;
  const missingContextCount = items.filter((item) =>
    matchesQueueFocusFilter(item, "missing-context", triageHistory),
  ).length;

  const signals: QueueCoachingSignal[] = [];

  if (summary.atRisk > 0) {
    signals.push({
      id: "at-risk-load",
      label: "At-risk queue load",
      detail: `${summary.atRisk} tickets are at risk right now. Prioritize the visible urgent path before taking new work.`,
      severity: summary.atRisk >= 3 ? "action" : "watch",
    });
  }

  if (summary.unassigned > 0) {
    signals.push({
      id: "unassigned-load",
      label: "Unassigned backlog",
      detail: `${summary.unassigned} tickets still have no owner. Use batch triage or claim flow before shift handoff.`,
      severity: summary.unassigned >= 4 ? "action" : "watch",
    });
  }

  if (missingContextCount > 0) {
    signals.push({
      id: "missing-context",
      label: "Missing context in active queue",
      detail: `${missingContextCount} tickets are missing structured intake context. Run intake analysis before drafting replies.`,
      severity: missingContextCount >= 3 ? "watch" : "info",
    });
  }

  if (repeatedIncidentCount > 0) {
    signals.push({
      id: "repeated-incidents",
      label: "Repeated issue families detected",
      detail: `${repeatedIncidentCount} tickets resemble repeated incidents. Consider a resolution kit or KB promotion after closure.`,
      severity: repeatedIncidentCount >= 3 ? "watch" : "info",
    });
  }

  if (policyHeavyCount > 0 || approvalHeavyCount > 0) {
    signals.push({
      id: "policy-approval-load",
      label: "Policy and approval-heavy workload",
      detail: `${policyHeavyCount + approvalHeavyCount} tickets require policy or approval context. Route these intentionally to reduce risky replies.`,
      severity: policyHeavyCount + approvalHeavyCount >= 4 ? "watch" : "info",
    });
  }

  const score = buildScore(summary, signals);
  const summaryText =
    signals.length === 0
      ? "Queue is stable. Keep ownership current and use batch triage only as new work arrives."
      : `${signals[0].label}: ${signals[0].detail}`;

  return {
    score,
    summary: summaryText,
    policyHeavyCount,
    approvalHeavyCount,
    repeatedIncidentCount,
    missingContextCount,
    topOwners,
    signals,
  };
}

export function buildQueueHandoffPackText(
  snapshot: QueueHandoffSnapshot,
  previous: QueueHandoffSnapshot | null,
): string {
  const delta = buildQueueHandoffDelta(snapshot, previous);

  const ownerSection =
    snapshot.ownerWorkload.length > 0
      ? snapshot.ownerWorkload
          .map((owner) => {
            return `- ${owner.owner}: open ${owner.openCount}, in progress ${owner.inProgressCount}, at risk ${owner.atRiskCount}`;
          })
          .join("\n")
      : "- No active owner workload.";

  const deltaSection = [
    `Open: ${delta.summaryDelta.open >= 0 ? "+" : ""}${delta.summaryDelta.open}`,
    `In progress: ${delta.summaryDelta.inProgress >= 0 ? "+" : ""}${delta.summaryDelta.inProgress}`,
    `Resolved: ${delta.summaryDelta.resolved >= 0 ? "+" : ""}${delta.summaryDelta.resolved}`,
    `At risk: ${delta.summaryDelta.atRisk >= 0 ? "+" : ""}${delta.summaryDelta.atRisk}`,
    `Unassigned: ${delta.summaryDelta.unassigned >= 0 ? "+" : ""}${delta.summaryDelta.unassigned}`,
  ].join(" · ");

  const riskSection =
    snapshot.topAtRisk.length > 0
      ? snapshot.topAtRisk
          .map(
            (item) =>
              `- ${item.ticketLabel} · ${item.priority} · owner ${item.owner} · due ${formatQueueTimestamp(item.slaDueAt)}`,
          )
          .join("\n")
      : "- No at-risk tickets right now.";

  return [
    `Shift Handoff · ${formatQueueTimestamp(snapshot.generatedAt)}`,
    "",
    `Queue summary: ${snapshot.summary.total} total · ${snapshot.summary.unassigned} unassigned · ${snapshot.summary.inProgress} in progress · ${snapshot.summary.resolved} resolved · ${snapshot.summary.atRisk} at risk`,
    delta.previousGeneratedAt
      ? `Change since last snapshot: ${deltaSection}`
      : "Change since last snapshot: first snapshot captured.",
    "",
    "Owner workload",
    ownerSection,
    "",
    "Top at-risk tickets",
    riskSection,
  ].join("\n");
}

function buildTicketLabel(draft: SavedDraft): string {
  return draft.ticket_id?.trim() || `Draft ${draft.id.slice(0, 8)}`;
}

export function buildQueueDispatchPreview(
  item: QueueItem,
  integrationType: CollaborationDispatchPreview["integration_type"],
): CollaborationDispatchPreview {
  const title = `${buildTicketLabel(item.draft)} · ${item.draft.summary_text || "Support update"}`;
  const payload = {
    ticket: buildTicketLabel(item.draft),
    summary: item.draft.summary_text || item.draft.input_text.slice(0, 200),
    owner: item.meta.owner,
    priority: item.meta.priority,
    state: item.meta.state,
    handoff_summary: item.draft.handoff_summary ?? null,
    response_preview:
      normalizeText(item.draft.response_text).slice(0, 280) || null,
  };

  const destinationLabelMap: Record<
    CollaborationDispatchPreview["integration_type"],
    string
  > = {
    jira: "Jira escalation comment",
    servicenow: "ServiceNow work note",
    slack: "Slack incident update",
    teams: "Teams shift handoff note",
  };

  return {
    integration_type: integrationType,
    title,
    destination_label: destinationLabelMap[integrationType],
    payload_preview: JSON.stringify(payload, null, 2),
  };
}

function parseDispatchHistory(raw: string | null): QueueDispatchHistoryEntry[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as QueueDispatchHistoryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function loadQueueDispatchHistory(
  storage: Pick<Storage, "getItem"> | null = typeof window !== "undefined"
    ? window.localStorage
    : null,
): QueueDispatchHistoryEntry[] {
  if (!storage) {
    return [];
  }

  try {
    return parseDispatchHistory(storage.getItem(DISPATCH_HISTORY_STORAGE_KEY));
  } catch {
    return [];
  }
}

export function persistQueueDispatchHistory(
  history: QueueDispatchHistoryEntry[],
  storage: Pick<Storage, "setItem"> | null = typeof window !== "undefined"
    ? window.localStorage
    : null,
): void {
  if (!storage) {
    return;
  }

  try {
    storage.setItem(DISPATCH_HISTORY_STORAGE_KEY, JSON.stringify(history));
  } catch {
    // Ignore storage write failures to keep preview flow usable.
  }
}

export function appendQueueDispatchHistory(
  preview: CollaborationDispatchPreview,
  item: QueueItem,
  storage: Pick<Storage, "getItem" | "setItem"> | null = typeof window !==
  "undefined"
    ? window.localStorage
    : null,
): QueueDispatchHistoryEntry[] {
  const nextEntry: QueueDispatchHistoryEntry = {
    id:
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}`,
    integration_type: preview.integration_type,
    title: preview.title,
    destination_label: preview.destination_label,
    draft_id: item.draft.id,
    ticket_label: buildTicketLabel(item.draft),
    payload_preview: preview.payload_preview,
    created_at: new Date().toISOString(),
  };

  const current = storage ? loadQueueDispatchHistory(storage) : [];
  const next = [nextEntry, ...current].slice(0, 20);
  persistQueueDispatchHistory(next, storage);
  return next;
}
