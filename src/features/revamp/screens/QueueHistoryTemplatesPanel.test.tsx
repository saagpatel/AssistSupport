// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueueHistoryTemplatesPanel } from "./QueueHistoryTemplatesPanel";
import type { ResponseTemplate, SavedDraft } from "../../../types/workspace";

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
const loadVariablesMock = vi.fn();

let draftsState: SavedDraft[] = [];
let templatesState: ResponseTemplate[] = [];
let loadingState = false;

vi.mock("../../../hooks/useDrafts", () => ({
  useDrafts: () => ({
    drafts: draftsState,
    templates: templatesState,
    loading: loadingState,
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

vi.mock("../../../hooks/useCustomVariables", () => ({
  useCustomVariables: () => ({
    variables: [
      { id: "custom-1", name: "team_name", value: "Network Operations" },
    ],
    loadVariables: loadVariablesMock,
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

function makeTemplate(
  partial: Partial<ResponseTemplate> = {},
): ResponseTemplate {
  return {
    id: partial.id ?? "template-1",
    name: partial.name ?? "Escalation note",
    category: partial.category ?? "VPN",
    content: partial.content ?? "Hello {{customer_name}}",
    created_at: partial.created_at ?? "2026-03-10T10:00:00.000Z",
    updated_at: partial.updated_at ?? "2026-03-10T10:00:00.000Z",
  };
}

describe("QueueHistoryTemplatesPanel", () => {
  beforeEach(() => {
    draftsState = [];
    templatesState = [];
    loadingState = false;
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
    loadVariablesMock.mockReset();

    searchDraftsMock.mockImplementation(async (query: string) =>
      draftsState.filter((draft) =>
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
        draftsState.find((draft) => draft.id === draftId) ?? null,
    );
    getDraftVersionsMock.mockResolvedValue([]);
    restoreDraftVersionMock.mockResolvedValue(true);
    computeInputHashMock.mockResolvedValue("hash-1");
    loadVariablesMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the controlled templates section without showing the internal section tabs", () => {
    templatesState = [makeTemplate()];

    render(
      <QueueHistoryTemplatesPanel activeSection="templates" hideSectionTabs />,
    );

    expect(screen.getByText("Escalation note")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Create Template" }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: /History \(/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Templates \(/ })).toBeNull();
  });

  it("filters draft history and deletes the selected draft after confirmation", async () => {
    draftsState = [
      makeDraft({
        id: "draft-1",
        ticket_id: "INC-1001",
        summary_text: "VPN outage",
      }),
      makeDraft({
        id: "draft-2",
        ticket_id: "INC-1002",
        summary_text: "Password reset",
        input_text: "Reset password for contractor login",
      }),
    ];

    render(<QueueHistoryTemplatesPanel />);

    fireEvent.change(screen.getByPlaceholderText("Filter by ticket..."), {
      target: { value: "INC-1002" },
    });
    expect(
      await screen.findByRole("button", { name: "INC-1002" }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "INC-1001" })).toBeNull();

    fireEvent.change(screen.getByPlaceholderText("Search drafts..."), {
      target: { value: "no-match" },
    });
    expect(await screen.findByText(/No drafts found/)).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText("Search drafts..."), {
      target: { value: "" },
    });
    expect(
      await screen.findByRole("button", { name: "INC-1002" }),
    ).toBeTruthy();

    fireEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]);
    const deleteButtons = await screen.findAllByRole("button", {
      name: "Delete",
    });
    fireEvent.click(deleteButtons[deleteButtons.length - 1]);

    await waitFor(() => {
      expect(deleteDraftMock).toHaveBeenCalledWith("draft-2");
    });
  });

  it("restores an older version and opens the restored draft in the workspace callback", async () => {
    const onLoadDraft = vi.fn();
    const currentDraft = makeDraft({
      id: "draft-1",
      response_text: "Current response",
    });
    const oldVersion = makeDraft({
      id: "draft-older",
      created_at: "2026-03-09T10:00:00.000Z",
      response_text: "Older response",
    });
    draftsState = [currentDraft];
    getDraftVersionsMock.mockResolvedValue([oldVersion]);
    getDraftMock.mockResolvedValue({
      ...currentDraft,
      response_text: "Restored response",
    });

    render(<QueueHistoryTemplatesPanel onLoadDraft={onLoadDraft} />);

    fireEvent.click(screen.getByRole("button", { name: "Versions" }));
    fireEvent.click(await screen.findByRole("button", { name: "Restore" }));

    await waitFor(() => {
      expect(restoreDraftVersionMock).toHaveBeenCalledWith(
        "draft-1",
        "draft-older",
      );
      expect(onLoadDraft).toHaveBeenCalledWith(
        expect.objectContaining({ response_text: "Restored response" }),
      );
    });
  });

  it("inserts template variables during template creation and saves the new template content", async () => {
    templatesState = [makeTemplate()];

    render(<QueueHistoryTemplatesPanel activeSection="templates" />);

    fireEvent.click(screen.getByRole("button", { name: "Create Template" }));
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Customer update" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Insert Variable" }));
    fireEvent.click(screen.getByRole("button", { name: /{{customer_name}}/ }));

    const contentField = screen.getByLabelText(
      "Content",
    ) as HTMLTextAreaElement;
    expect(contentField.value).toContain("{{customer_name}}");

    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(saveTemplateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Customer update",
          content: expect.stringContaining("{{customer_name}}"),
        }),
      );
    });
  });
});
