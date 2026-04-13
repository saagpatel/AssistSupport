// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspaceDialogs } from "./WorkspaceDialogs";

vi.mock("./SaveAsTemplateModal", () => ({
  SaveAsTemplateModal: ({ content }: { content: string }) => (
    <div>Template modal:{content}</div>
  ),
}));

describe("WorkspaceDialogs", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows the template modal only when there is response content to save", () => {
    const { rerender } = render(
      <WorkspaceDialogs
        showTemplateModal
        response="Draft response"
        savedDraftId="draft-1"
        onTemplateSave={vi.fn(async () => true)}
        onCloseTemplateModal={vi.fn()}
        pendingSimilarCaseOpen={null}
        onCloseSimilarCaseDialog={vi.fn()}
        onConfirmOpenSimilarCase={vi.fn()}
        hasResponse
        pendingDraftOpen={null}
        onCloseDraftDialog={vi.fn()}
        onConfirmOpenDraft={vi.fn()}
      />,
    );

    expect(screen.getByText("Template modal:Draft response")).toBeTruthy();

    rerender(
      <WorkspaceDialogs
        showTemplateModal
        response=""
        savedDraftId="draft-1"
        onTemplateSave={vi.fn(async () => true)}
        onCloseTemplateModal={vi.fn()}
        pendingSimilarCaseOpen={null}
        onCloseSimilarCaseDialog={vi.fn()}
        onConfirmOpenSimilarCase={vi.fn()}
        hasResponse={false}
        pendingDraftOpen={null}
        onCloseDraftDialog={vi.fn()}
        onConfirmOpenDraft={vi.fn()}
      />,
    );

    expect(screen.queryByText("Template modal:Draft response")).toBeNull();
  });

  it("keeps compare disabled without a response and routes the other confirm actions correctly", () => {
    const onConfirmOpenSimilarCase = vi.fn();
    const onConfirmOpenDraft = vi.fn();

    render(
      <WorkspaceDialogs
        showTemplateModal={false}
        response=""
        savedDraftId="draft-1"
        onTemplateSave={vi.fn(async () => true)}
        onCloseTemplateModal={vi.fn()}
        pendingSimilarCaseOpen={{
          draft_id: "similar-1",
          ticket_id: "INC-1",
          title: "VPN outage follow-up",
          excerpt: "VPN outage",
          response_excerpt: "Escalated",
          response_text: "Escalated",
          handoff_summary: null,
          status: "draft",
          updated_at: "2026-03-24T12:00:00.000Z",
          match_score: 0.9,
          explanation: {
            summary: "Similar outage",
            matched_terms: ["vpn"],
            reasons: ["Shared symptoms"],
            authoritative: false,
          },
        }}
        onCloseSimilarCaseDialog={vi.fn()}
        onConfirmOpenSimilarCase={onConfirmOpenSimilarCase}
        hasResponse={false}
        pendingDraftOpen={{
          id: "draft-2",
          input_text: "VPN issue",
          summary_text: "VPN issue",
          diagnosis_json: null,
          response_text: null,
          ticket_id: "INC-2",
          kb_sources_json: null,
          created_at: "2026-03-24T12:00:00.000Z",
          updated_at: "2026-03-24T12:00:00.000Z",
          is_autosave: false,
          status: "draft",
          handoff_summary: null,
          finalized_at: null,
          finalized_by: null,
        }}
        onCloseDraftDialog={vi.fn()}
        onConfirmOpenDraft={onConfirmOpenDraft}
      />,
    );

    expect(
      (
        screen.getByRole("button", {
          name: "Compare instead",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);

    const saveAndOpenButtons = screen.getAllByRole("button", {
      name: "Save and open",
    });
    const openAnywayButtons = screen.getAllByRole("button", {
      name: "Open anyway",
    });

    fireEvent.click(saveAndOpenButtons[0] as HTMLButtonElement);
    fireEvent.click(openAnywayButtons[0] as HTMLButtonElement);

    expect(onConfirmOpenSimilarCase).toHaveBeenCalledWith("save-and-open");
    expect(onConfirmOpenSimilarCase).toHaveBeenCalledWith("replace");

    fireEvent.click(saveAndOpenButtons[1] as HTMLButtonElement);
    fireEvent.click(openAnywayButtons[1] as HTMLButtonElement);
    expect(onConfirmOpenDraft).toHaveBeenCalledWith("save-and-open");
    expect(onConfirmOpenDraft).toHaveBeenCalledWith("replace");
  });
});
