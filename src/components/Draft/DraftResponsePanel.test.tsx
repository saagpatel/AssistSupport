// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DraftResponsePanel } from "./DraftResponsePanel";

vi.mock("./ResponsePanel", () => ({
  ResponsePanel: ({ response }: { response: string }) => (
    <div data-testid="response-panel">{response || "empty"}</div>
  ),
}));

vi.mock("./AlternativePanel", () => ({
  AlternativePanel: () => <div data-testid="alternative-panel" />,
}));

vi.mock("./SavedResponsesSuggestion", () => ({
  SavedResponsesSuggestion: () => <div data-testid="saved-suggestion" />,
}));

function makeProps(
  overrides: Partial<Parameters<typeof DraftResponsePanel>[0]> = {},
) {
  return {
    suggestions: [],
    suggestionsDismissed: false,
    onSuggestionApply: vi.fn(),
    onSuggestionDismiss: vi.fn(),
    response: "",
    streamingText: "",
    isStreaming: false,
    sources: [],
    generating: false,
    metrics: null,
    confidence: null,
    grounding: [],
    savedDraftId: null,
    hasInput: false,
    isResponseEdited: false,
    loadedModelName: null,
    currentTicketId: null,
    onSaveDraft: vi.fn(),
    onCancel: vi.fn(),
    onResponseChange: vi.fn(),
    onGenerateAlternative: vi.fn(),
    generatingAlternative: false,
    onSaveAsTemplate: vi.fn(),
    alternatives: [],
    onChooseAlternative: vi.fn(),
    onUseAlternative: vi.fn(),
    ...overrides,
  };
}

describe("DraftResponsePanel", () => {
  afterEach(() => cleanup());

  it("renders the response panel by itself when no suggestions or alternatives are present", () => {
    render(<DraftResponsePanel {...makeProps()} />);

    expect(screen.getByTestId("response-panel")).toBeTruthy();
    expect(screen.queryByTestId("saved-suggestion")).toBeNull();
    expect(screen.queryByTestId("alternative-panel")).toBeNull();
  });

  it("shows the saved-responses suggestion when suggestions exist, no response, and not dismissed", () => {
    render(
      <DraftResponsePanel
        {...makeProps({
          suggestions: [
            {
              id: "t1",
              name: "t",
              content: "snippet",
              created_at: "",
              updated_at: "",
              usage_count: 0,
            } as unknown as Parameters<
              typeof DraftResponsePanel
            >[0]["suggestions"][number],
          ],
        })}
      />,
    );

    expect(screen.getByTestId("saved-suggestion")).toBeTruthy();
  });

  it("hides the suggestion once the user has a response", () => {
    render(
      <DraftResponsePanel {...makeProps({ response: "generated text" })} />,
    );

    expect(screen.queryByTestId("saved-suggestion")).toBeNull();
    expect(screen.getByTestId("response-panel").textContent).toBe(
      "generated text",
    );
  });

  it("shows the alternative panel only when alternatives exist and generation is idle", () => {
    const baseAlt = {
      id: "a",
      original_text: "o",
      alternative_text: "new",
      created_at: "",
      chosen: null,
    } as unknown as Parameters<
      typeof DraftResponsePanel
    >[0]["alternatives"][number];

    const { rerender } = render(
      <DraftResponsePanel
        {...makeProps({ response: "x", alternatives: [baseAlt] })}
      />,
    );
    expect(screen.getByTestId("alternative-panel")).toBeTruthy();

    rerender(
      <DraftResponsePanel
        {...makeProps({
          response: "x",
          alternatives: [baseAlt],
          generating: true,
        })}
      />,
    );
    expect(screen.queryByTestId("alternative-panel")).toBeNull();
  });
});
