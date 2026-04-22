// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueueCommandCenterPage } from "./QueueCommandCenterPage";
import type { SavedDraft } from "../../../types/workspace";

const loadDraftsMock = vi.fn();
const searchDraftsMock = vi.fn();
const loadTemplatesMock = vi.fn();
const deleteDraftMock = vi.fn();
const saveTemplateMock = vi.fn();
const updateTemplateMock = vi.fn();
const deleteTemplateMock = vi.fn();
const getDraftMock = vi.fn();
const getDraftVersionsMock = vi.fn();
const restoreDraftVersionMock = vi.fn();
const computeInputHashMock = vi.fn();
const clusterTicketsForTriageMock = vi.fn();
const listRecentTriageClustersMock = vi.fn();
const previewCollaborationDispatchMock = vi.fn();
const confirmCollaborationDispatchMock = vi.fn();
const cancelCollaborationDispatchMock = vi.fn();
const listDispatchHistoryMock = vi.fn();
const logEventMock = vi.fn();
const showSuccessMock = vi.fn();
const showErrorMock = vi.fn();
let collaborationDispatchEnabled = false;

let draftState: {
  drafts: SavedDraft[];
  templates: Array<{
    id: string;
    name: string;
    category: string | null;
    content: string;
    created_at: string;
    updated_at: string;
  }>;
  loading: boolean;
  error: string | null;
};

vi.mock("../../../hooks/useDrafts", () => ({
  useDrafts: () => ({
    drafts: draftState.drafts,
    templates: draftState.templates,
    loading: draftState.loading,
    error: draftState.error,
    loadDrafts: loadDraftsMock,
    searchDrafts: searchDraftsMock,
    loadTemplates: loadTemplatesMock,
    deleteDraft: deleteDraftMock,
    saveTemplate: saveTemplateMock,
    updateTemplate: updateTemplateMock,
    deleteTemplate: deleteTemplateMock,
    getDraft: getDraftMock,
    getDraftVersions: getDraftVersionsMock,
    restoreDraftVersion: restoreDraftVersionMock,
    computeInputHash: computeInputHashMock,
  }),
}));

vi.mock("../../../hooks/useQueueOps", () => ({
  useQueueOps: () => ({
    clusterTicketsForTriage: clusterTicketsForTriageMock,
    listRecentTriageClusters: listRecentTriageClustersMock,
    previewCollaborationDispatch: previewCollaborationDispatchMock,
    confirmCollaborationDispatch: confirmCollaborationDispatchMock,
    cancelCollaborationDispatch: cancelCollaborationDispatchMock,
    listDispatchHistory: listDispatchHistoryMock,
  }),
}));

vi.mock("../../revamp", () => ({
  resolveRevampFlags: () => ({
    ASSISTSUPPORT_REVAMP_COMMAND_PALETTE_V2: true,
    ASSISTSUPPORT_TICKET_WORKSPACE_V2: true,
    ASSISTSUPPORT_STRUCTURED_INTAKE: true,
    ASSISTSUPPORT_SIMILAR_CASES: true,
    ASSISTSUPPORT_NEXT_BEST_ACTION: true,
    ASSISTSUPPORT_GUIDED_RUNBOOKS_V2: true,
    ASSISTSUPPORT_POLICY_APPROVAL_ASSISTANT: true,
    ASSISTSUPPORT_BATCH_TRIAGE: true,
    ASSISTSUPPORT_COLLABORATION_DISPATCH: collaborationDispatchEnabled,
    ASSISTSUPPORT_WORKSPACE_COMMAND_PALETTE: true,
    ASSISTSUPPORT_LLM_ROUTER_V2: false,
    ASSISTSUPPORT_ENABLE_ADMIN_TABS: false,
    ASSISTSUPPORT_ENABLE_NETWORK_INGEST: false,
  }),
}));

vi.mock("../../../hooks/useAnalytics", () => ({
  useAnalytics: () => ({
    logEvent: logEventMock,
  }),
}));

vi.mock("../../../contexts/ToastContext", () => ({
  useToastContext: () => ({
    success: showSuccessMock,
    error: showErrorMock,
  }),
}));

function makeDraft(partial: Partial<SavedDraft> = {}): SavedDraft {
  return {
    id: partial.id ?? "draft-1",
    input_text: partial.input_text ?? "VPN outage for west region users",
    summary_text: partial.summary_text ?? "VPN outage",
    diagnosis_json: partial.diagnosis_json ?? null,
    response_text: partial.response_text ?? "Escalated to network team.",
    ticket_id: partial.ticket_id ?? "INC-1001",
    kb_sources_json: partial.kb_sources_json ?? null,
    created_at: partial.created_at ?? "2026-03-10T10:00:00.000Z",
    updated_at: partial.updated_at ?? "2026-03-10T10:00:00.000Z",
    is_autosave: partial.is_autosave ?? false,
    model_name: partial.model_name ?? "Local Model",
    case_intake_json: partial.case_intake_json ?? null,
    status: partial.status ?? "draft",
    handoff_summary: partial.handoff_summary ?? null,
    finalized_at: partial.finalized_at ?? null,
    finalized_by: partial.finalized_by ?? null,
  };
}

describe("QueueCommandCenterPage", () => {
  beforeEach(() => {
    draftState = {
      drafts: [],
      templates: [],
      loading: false,
      error: null,
    };
    loadDraftsMock.mockReset();
    searchDraftsMock.mockReset();
    loadTemplatesMock.mockReset();
    deleteDraftMock.mockReset();
    saveTemplateMock.mockReset();
    updateTemplateMock.mockReset();
    deleteTemplateMock.mockReset();
    getDraftMock.mockReset();
    getDraftVersionsMock.mockReset();
    restoreDraftVersionMock.mockReset();
    computeInputHashMock.mockReset();
    clusterTicketsForTriageMock.mockReset();
    listRecentTriageClustersMock.mockReset();
    previewCollaborationDispatchMock.mockReset();
    confirmCollaborationDispatchMock.mockReset();
    cancelCollaborationDispatchMock.mockReset();
    listDispatchHistoryMock.mockReset();
    logEventMock.mockReset();
    showSuccessMock.mockReset();
    showErrorMock.mockReset();
    collaborationDispatchEnabled = false;
    searchDraftsMock.mockImplementation(async (query: string) =>
      draftState.drafts.filter((draft) =>
        `${draft.ticket_id ?? ""} ${draft.summary_text ?? ""} ${draft.input_text}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    );
    loadTemplatesMock.mockResolvedValue(undefined);
    deleteDraftMock.mockResolvedValue(true);
    saveTemplateMock.mockResolvedValue("template-1");
    updateTemplateMock.mockResolvedValue("template-1");
    deleteTemplateMock.mockResolvedValue(true);
    getDraftMock.mockImplementation(
      async (draftId: string) =>
        draftState.drafts.find((draft) => draft.id === draftId) ?? null,
    );
    getDraftVersionsMock.mockResolvedValue([]);
    restoreDraftVersionMock.mockResolvedValue(true);
    computeInputHashMock.mockResolvedValue("hash-1");
    listRecentTriageClustersMock.mockResolvedValue([]);
    listDispatchHistoryMock.mockResolvedValue([]);
    if (
      typeof localStorage !== "undefined" &&
      typeof localStorage.clear === "function"
    ) {
      localStorage.clear();
    }
  });

  afterEach(() => {
    cleanup();
  });

  it("shows queue loading state while drafts are being fetched", () => {
    draftState.loading = true;

    render(<QueueCommandCenterPage onLoadDraft={vi.fn()} />);

    expect(screen.getByText("Loading…")).toBeTruthy();
    expect(loadDraftsMock).toHaveBeenCalledWith(100);
  });

  it("shows an error recovery state when queue data cannot be loaded", async () => {
    const user = userEvent.setup();
    draftState.error = "draft load failed";

    render(<QueueCommandCenterPage onLoadDraft={vi.fn()} />);

    expect(screen.getByText("Queue unavailable")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Retry Load" }));
    expect(loadDraftsMock).toHaveBeenCalledTimes(2);
  });

  it("switches between triage, history, and templates without leaving the queue surface", async () => {
    const user = userEvent.setup();
    draftState.drafts = [makeDraft()];
    draftState.templates = [
      {
        id: "template-1",
        name: "Escalation note",
        category: "VPN",
        content: "Share an update with {{customer_name}}",
        created_at: "2026-03-10T10:00:00.000Z",
        updated_at: "2026-03-10T10:00:00.000Z",
      },
    ];

    render(<QueueCommandCenterPage onLoadDraft={vi.fn()} />);

    expect(
      screen.getByRole("heading", { name: "Queue Command Center" }),
    ).toBeTruthy();
    expect(screen.getByLabelText("Search queue")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "History" }));
    expect(await screen.findByPlaceholderText("Search drafts...")).toBeTruthy();
    expect(screen.queryByLabelText("Search queue")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Templates" }));
    expect(
      await screen.findByRole("button", { name: "Create Template" }),
    ).toBeTruthy();
    expect(screen.getByText("Escalation note")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Triage" }));
    expect(await screen.findByLabelText("Search queue")).toBeTruthy();
  });

  it("opens a queue item into Workspace from the canonical triage surface", async () => {
    const user = userEvent.setup();
    draftState.drafts = [makeDraft()];
    const onLoadDraft = vi.fn();

    render(<QueueCommandCenterPage onLoadDraft={onLoadDraft} />);

    await user.click(await screen.findByRole("button", { name: "Open Draft" }));

    expect(onLoadDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "draft-1",
        ticket_id: "INC-1001",
      }),
    );
  });

  it("consumes one-shot queue views and returns history/templates users to triage when a queue deep link arrives", async () => {
    const user = userEvent.setup();
    draftState.drafts = [makeDraft()];
    const onQueueViewConsumed = vi.fn();
    const { rerender } = render(
      <QueueCommandCenterPage
        onLoadDraft={vi.fn()}
        initialQueueView="at_risk"
        onQueueViewConsumed={onQueueViewConsumed}
      />,
    );

    await waitFor(() => {
      expect(onQueueViewConsumed).toHaveBeenCalledTimes(1);
    });

    await user.click(screen.getByRole("button", { name: "History" }));
    expect(await screen.findByPlaceholderText("Search drafts...")).toBeTruthy();

    rerender(
      <QueueCommandCenterPage
        onLoadDraft={vi.fn()}
        initialQueueView="resolved"
        onQueueViewConsumed={onQueueViewConsumed}
      />,
    );

    expect(await screen.findByLabelText("Search queue")).toBeTruthy();
    expect(onQueueViewConsumed).toHaveBeenCalledTimes(2);
  });

  it("filters missing-context work and runs batch triage from the visible queue", async () => {
    const user = userEvent.setup();
    draftState.drafts = [
      makeDraft({
        case_intake_json: JSON.stringify({
          issue: "VPN outage",
          missing_data: ["affected system"],
          note_audience: "internal-note",
        }),
      }),
    ];
    clusterTicketsForTriageMock.mockResolvedValue([
      {
        cluster_key: "vpn",
        summary: "VPN issues",
        ticket_ids: ["INC-1001"],
      },
    ]);

    render(<QueueCommandCenterPage onLoadDraft={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Missing context" }));
    expect(screen.getAllByText("INC-1001")).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "Use visible queue" }));
    const input = screen.getByLabelText(
      "Batch triage input",
    ) as HTMLTextAreaElement;
    expect(input.value).toContain("INC-1001|VPN outage");

    await user.click(screen.getByRole("button", { name: "Run triage" }));

    await waitFor(() => {
      expect(clusterTicketsForTriageMock).toHaveBeenCalledWith([
        { id: "INC-1001", summary: "VPN outage" },
      ]);
    });
    expect(await screen.findByText(/VPN issues/)).toBeTruthy();
    expect(showSuccessMock).toHaveBeenCalledWith("Batch triage completed");
  });

  it("previews and records a queue dispatch send when collaboration dispatch is enabled", async () => {
    const user = userEvent.setup();
    collaborationDispatchEnabled = true;
    draftState.drafts = [makeDraft()];
    previewCollaborationDispatchMock.mockResolvedValue({
      id: "dispatch-1",
      integration_type: "jira",
      draft_id: "draft-1",
      title: "Escalation · INC-1001",
      destination_label: "Jira escalation payload",
      payload_preview: "Escalation summary",
      status: "previewed",
      metadata_json: null,
      created_at: "2026-03-10T10:00:00.000Z",
      updated_at: "2026-03-10T10:00:00.000Z",
    });
    confirmCollaborationDispatchMock.mockResolvedValue({
      id: "dispatch-1",
      integration_type: "jira",
      draft_id: "draft-1",
      title: "Escalation · INC-1001",
      destination_label: "Jira escalation payload",
      payload_preview: "Escalation summary",
      status: "sent",
      metadata_json: null,
      created_at: "2026-03-10T10:00:00.000Z",
      updated_at: "2026-03-10T10:01:00.000Z",
    });
    listDispatchHistoryMock.mockResolvedValue([
      {
        id: "dispatch-1",
        integration_type: "jira",
        draft_id: "draft-1",
        title: "Escalation · INC-1001",
        destination_label: "Jira escalation payload",
        payload_preview: "Escalation summary",
        status: "previewed",
        metadata_json: null,
        created_at: "2026-03-10T10:00:00.000Z",
        updated_at: "2026-03-10T10:00:00.000Z",
      },
    ]);

    render(<QueueCommandCenterPage onLoadDraft={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Preview payload" }));

    await waitFor(() => {
      expect(previewCollaborationDispatchMock).toHaveBeenCalled();
    });

    expect(await screen.findByText("Jira escalation payload")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Confirm sent" }));

    await waitFor(() => {
      expect(confirmCollaborationDispatchMock).toHaveBeenCalledWith(
        "dispatch-1",
      );
    });
    expect(showSuccessMock).toHaveBeenCalledWith(
      "Jira escalation payload dispatch confirmed as sent",
    );
  });
});
