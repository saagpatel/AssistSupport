import { describe, expect, it } from "vitest";
import { bandLabel, formatTicketLabel, truncate } from "./queueHelpers";
import type { QueueItem } from "../../inbox/queueModel";
import type { SavedDraft } from "../../../types/workspace";

function makeItem(
  state: QueueItem["meta"]["state"],
  owner: string,
  isAtRisk = false,
): QueueItem {
  return {
    draft: { id: "d", ticket_id: null } as unknown as SavedDraft,
    meta: {
      owner,
      state,
      priority: "normal",
      updatedAt: "2026-04-01T00:00:00Z",
    },
    slaDueAt: "2026-04-02T00:00:00Z",
    isAtRisk,
  } as QueueItem;
}

describe("formatTicketLabel", () => {
  it("prefers the ticket id when present", () => {
    expect(
      formatTicketLabel({
        id: "abc12345678",
        ticket_id: "INC-42",
      } as SavedDraft),
    ).toBe("INC-42");
  });

  it("falls back to a truncated draft id when there is no ticket id", () => {
    expect(
      formatTicketLabel({
        id: "abcdef0123456789",
        ticket_id: null,
      } as SavedDraft),
    ).toBe("Draft abcdef01");
  });
});

describe("truncate", () => {
  it("returns the original string when under the limit", () => {
    expect(truncate("short", 10)).toBe("short");
  });

  it("adds an ellipsis when over the limit", () => {
    expect(truncate("abcdefghij", 5)).toBe("abcde...");
  });
});

describe("bandLabel", () => {
  it("resolves the band from meta.state + owner + isAtRisk in priority order", () => {
    expect(bandLabel(makeItem("resolved", "alice"))).toBe("Resolved");
    expect(bandLabel(makeItem("open", "alice", true))).toBe("At Risk");
    expect(bandLabel(makeItem("open", "unassigned"))).toBe("Unassigned");
    expect(bandLabel(makeItem("in_progress", "alice"))).toBe("In Progress");
    expect(bandLabel(makeItem("open", "alice"))).toBe("Open");
  });
});
