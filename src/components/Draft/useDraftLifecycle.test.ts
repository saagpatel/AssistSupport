// @vitest-environment jsdom
// Window-level keyboard-shortcut dispatches are kept on fireEvent below:
// userEvent.keyboard() types into the currently-focused element, but these
// tests verify a GLOBAL document listener — fireEvent is the right tool for
// the job per Testing Library guidance on non-user-interaction tests.
import { fireEvent, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDraftLifecycle } from "./useDraftLifecycle";

type HookOptions = Parameters<typeof useDraftLifecycle>[0];

function makeOptions(overrides: Partial<HookOptions> = {}): HookOptions {
  return {
    initialDraft: null,
    viewMode: "panels",
    input: "",
    savedDraftId: null,
    refreshWorkspaceCatalog: vi.fn().mockResolvedValue(undefined),
    findSimilar: vi.fn().mockResolvedValue(undefined),
    loadAlternatives: vi.fn().mockResolvedValue(undefined),
    loadTemplates: vi.fn().mockResolvedValue(undefined),
    handleLoadDraft: vi.fn(),
    onPanelDensityModeChange: vi.fn(),
    setSuggestionsDismissed: vi.fn(),
    ...overrides,
  };
}

describe("useDraftLifecycle", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("refreshes catalog and loads templates on mount", () => {
    const options = makeOptions();
    renderHook(() => useDraftLifecycle(options));

    expect(options.refreshWorkspaceCatalog).toHaveBeenCalledTimes(1);
    expect(options.loadTemplates).toHaveBeenCalledTimes(1);
  });

  it("finds similar saved responses once input has 10+ characters", () => {
    const options = makeOptions({ input: "short" });
    const { rerender } = renderHook(
      (props: HookOptions) => useDraftLifecycle(props),
      { initialProps: options },
    );
    expect(options.findSimilar).not.toHaveBeenCalled();

    const updated = makeOptions({
      ...options,
      input: "longer than ten characters",
    });
    rerender(updated);

    expect(updated.findSimilar).toHaveBeenCalledWith(
      "longer than ten characters",
    );
    expect(updated.setSuggestionsDismissed).toHaveBeenCalledWith(false);
  });

  it("loads alternatives when a savedDraftId appears", () => {
    const options = makeOptions();
    const { rerender } = renderHook(
      (props: HookOptions) => useDraftLifecycle(props),
      { initialProps: options },
    );
    expect(options.loadAlternatives).not.toHaveBeenCalled();

    const updated = makeOptions({ ...options, savedDraftId: "draft-1" });
    rerender(updated);

    expect(updated.loadAlternatives).toHaveBeenCalledWith("draft-1");
  });

  it("fires initialDraft load exactly once when the prop is provided", () => {
    const initialDraft = { id: "d-1" } as HookOptions["initialDraft"];
    const options = makeOptions({ initialDraft });
    renderHook(() => useDraftLifecycle(options));

    expect(options.handleLoadDraft).toHaveBeenCalledWith(initialDraft);
  });

  it("maps Cmd-1/2/3 to the three panel density modes in panels view", () => {
    const options = makeOptions({ viewMode: "panels" });
    renderHook(() => useDraftLifecycle(options));

    fireEvent.keyDown(window, { key: "1", metaKey: true });
    expect(options.onPanelDensityModeChange).toHaveBeenCalledWith("balanced");

    fireEvent.keyDown(window, { key: "2", metaKey: true });
    expect(options.onPanelDensityModeChange).toHaveBeenCalledWith(
      "focus-intake",
    );

    fireEvent.keyDown(window, { key: "3", metaKey: true });
    expect(options.onPanelDensityModeChange).toHaveBeenCalledWith(
      "focus-response",
    );
  });

  it("ignores keyboard shortcuts when viewMode is conversation", () => {
    const options = makeOptions({ viewMode: "conversation" });
    renderHook(() => useDraftLifecycle(options));

    fireEvent.keyDown(window, { key: "1", metaKey: true });
    expect(options.onPanelDensityModeChange).not.toHaveBeenCalled();
  });

  it("ignores keyboard shortcuts when focus is in an editable target", () => {
    const options = makeOptions({ viewMode: "panels" });
    renderHook(() => useDraftLifecycle(options));

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    fireEvent.keyDown(input, { key: "1", metaKey: true, bubbles: true });
    expect(options.onPanelDensityModeChange).not.toHaveBeenCalled();

    document.body.removeChild(input);
  });
});
