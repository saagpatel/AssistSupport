// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useQueueOperationHandlers } from "./useQueueOperationHandlers";
import type { QueueItem } from "../../inbox/queueModel";
import type { SavedDraft } from "../../../types/workspace";

function makeItem(
  id: string,
  state: QueueItem["meta"]["state"] = "open",
  owner = "unassigned",
): QueueItem {
  return {
    draft: { id, ticket_id: `INC-${id}` } as unknown as SavedDraft,
    meta: {
      owner,
      state,
      priority: "normal",
      updatedAt: "2026-04-01T00:00:00Z",
    },
    slaDueAt: "2026-04-02T00:00:00Z",
    isAtRisk: false,
  } as QueueItem;
}

function makeKeyEvent(
  key: string,
  tagName = "DIV",
): React.KeyboardEvent<HTMLElement> {
  return {
    key,
    preventDefault: vi.fn(),
    target: { tagName },
  } as unknown as React.KeyboardEvent<HTMLElement>;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("useQueueOperationHandlers", () => {
  it("writes in_progress + operator on claim and logs the event", () => {
    const updateQueueMeta = vi.fn();
    const logEvent = vi.fn();

    const { result } = renderHook(() =>
      useQueueOperationHandlers({
        filteredItems: [makeItem("1")],
        selectedIndex: 0,
        setSelectedIndex: vi.fn(),
        updateQueueMeta,
        operatorName: "alice",
        onLoadDraft: vi.fn(),
        logEvent,
      }),
    );

    act(() => result.current.handleClaim("1"));

    expect(updateQueueMeta).toHaveBeenCalledWith("1", {
      owner: "alice",
      state: "in_progress",
    });
    expect(logEvent).toHaveBeenCalledWith("queue_item_claimed", {
      draft_id: "1",
      operator: "alice",
    });
  });

  it("resolves and reopens via the state transitions", () => {
    const updateQueueMeta = vi.fn();

    const { result } = renderHook(() =>
      useQueueOperationHandlers({
        filteredItems: [makeItem("1")],
        selectedIndex: 0,
        setSelectedIndex: vi.fn(),
        updateQueueMeta,
        operatorName: "alice",
        onLoadDraft: vi.fn(),
        logEvent: vi.fn(),
      }),
    );

    act(() => result.current.handleResolve("1"));
    act(() => result.current.handleReopen("1"));

    expect(updateQueueMeta).toHaveBeenNthCalledWith(1, "1", {
      state: "resolved",
    });
    expect(updateQueueMeta).toHaveBeenNthCalledWith(2, "1", {
      state: "open",
    });
  });

  it("advances selection on J and claims on C via keyboard shortcuts", () => {
    const updateQueueMeta = vi.fn();
    const setSelectedIndex = vi.fn();

    const { result } = renderHook(() =>
      useQueueOperationHandlers({
        filteredItems: [makeItem("1"), makeItem("2")],
        selectedIndex: 0,
        setSelectedIndex,
        updateQueueMeta,
        operatorName: "alice",
        onLoadDraft: vi.fn(),
        logEvent: vi.fn(),
      }),
    );

    act(() => result.current.handleQueueKeyDown(makeKeyEvent("j")));
    expect(setSelectedIndex).toHaveBeenCalled();

    act(() => result.current.handleQueueKeyDown(makeKeyEvent("c")));
    expect(updateQueueMeta).toHaveBeenCalledWith("1", {
      owner: "alice",
      state: "in_progress",
    });
  });

  it("ignores shortcuts when the event target is an INPUT", () => {
    const setSelectedIndex = vi.fn();

    const { result } = renderHook(() =>
      useQueueOperationHandlers({
        filteredItems: [makeItem("1"), makeItem("2")],
        selectedIndex: 0,
        setSelectedIndex,
        updateQueueMeta: vi.fn(),
        operatorName: "alice",
        onLoadDraft: vi.fn(),
        logEvent: vi.fn(),
      }),
    );

    act(() => result.current.handleQueueKeyDown(makeKeyEvent("j", "INPUT")));

    expect(setSelectedIndex).not.toHaveBeenCalled();
  });
});
