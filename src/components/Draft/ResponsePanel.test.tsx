// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResponsePanel } from "./ResponsePanel";
import type { ContextSource } from "../../types/knowledge";

const invokeMock = vi.fn();
const showSuccessMock = vi.fn();
const showErrorMock = vi.fn();
const writeTextMock = vi.fn(async () => undefined);

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

vi.mock("../../contexts/ToastContext", () => ({
  useToastContext: () => ({ success: showSuccessMock, error: showErrorMock }),
}));

vi.mock("./RatingPanel", () => ({
  RatingPanel: () => <div data-testid="rating-panel" />,
}));

vi.mock("./JiraPostPanel", () => ({
  JiraPostPanel: () => <div data-testid="jira-post-panel" />,
}));

function makeSource(overrides: Partial<ContextSource> = {}): ContextSource {
  return {
    chunk_id: "chunk-1",
    document_id: "doc-1",
    file_path: "/kb/reset-password.md",
    title: "Reset Password",
    heading_path: "Guides > Reset",
    score: 0.82,
    search_method: "Hybrid",
    source_type: "file",
    ...overrides,
  };
}

beforeEach(() => {
  invokeMock.mockReset();
  showSuccessMock.mockReset();
  showErrorMock.mockReset();
  writeTextMock.mockClear();
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: writeTextMock },
  });
});

afterEach(() => {
  cleanup();
});

describe("ResponsePanel", () => {
  it("renders a canned response with word count and KB sources", () => {
    render(
      <ResponsePanel
        response="Please reset your password using the self-service portal."
        streamingText=""
        isStreaming={false}
        sources={[makeSource()]}
        generating={false}
        metrics={null}
        confidence={{
          mode: "answer",
          score: 0.82,
          rationale: "Strong KB match.",
        }}
      />,
    );

    expect(
      screen.getByRole("heading", { level: 3, name: "Response" }),
    ).toBeTruthy();
    expect(screen.getByText(/8 words/)).toBeTruthy();
    expect(screen.getByText("Ready to answer")).toBeTruthy();
    // Auto-show-sources effect opens the panel on first non-streaming render
    // with sources available, so the toggle renders as "Hide Sources".
    expect(screen.getByRole("button", { name: "Hide Sources" })).toBeTruthy();
    expect(screen.getByText("Knowledge Base Sources")).toBeTruthy();
  });

  it("gates copy when mode is clarify and records an audit override", async () => {
    invokeMock.mockResolvedValue(undefined);

    render(
      <ResponsePanel
        response="Please gather more logs before acting."
        streamingText=""
        isStreaming={false}
        sources={[]}
        generating={false}
        metrics={null}
        confidence={{
          mode: "clarify",
          score: 0.4,
          rationale: "Missing info.",
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy" }));

    const reasonInput = await screen.findByPlaceholderText(
      /Explain why copying without citations/,
    );
    fireEvent.change(reasonInput, {
      target: { value: "User confirmed out-of-band, tolerable risk." },
    });

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /Copy with override/ }),
      );
    });

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        "audit_response_copy_override",
        expect.objectContaining({
          reason: "User confirmed out-of-band, tolerable risk.",
          confidenceMode: "clarify",
          sourcesCount: 0,
        }),
      );
    });
    expect(writeTextMock).toHaveBeenCalledWith(
      "Please gather more logs before acting.",
    );
    expect(showSuccessMock).toHaveBeenCalledWith(
      "Response copied (override logged)",
    );
  });

  it("expands a source row and fetches its preview content", async () => {
    invokeMock.mockResolvedValue([
      {
        id: "chunk-1",
        chunk_index: 0,
        content: "Full KB chunk body for preview",
      },
    ]);

    render(
      <ResponsePanel
        response="Resolved via KB article."
        streamingText=""
        isStreaming={false}
        sources={[makeSource()]}
        generating={false}
        metrics={null}
        confidence={{ mode: "answer", score: 0.9, rationale: "ok" }}
      />,
    );

    // Sources panel auto-opens on non-streaming render with sources.
    const expandToggle = screen
      .getByText("Reset Password")
      .closest("button") as HTMLButtonElement;
    expect(expandToggle).toBeTruthy();
    await act(async () => {
      fireEvent.click(expandToggle);
    });

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("get_document_chunks", {
        documentId: "doc-1",
      });
    });
    expect(
      await screen.findByText("Full KB chunk body for preview"),
    ).toBeTruthy();
  });
});
