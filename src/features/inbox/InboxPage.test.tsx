// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InboxPage } from "./InboxPage";

vi.mock("../revamp", () => ({
  QueueCommandCenterPage: ({
    initialQueueView,
  }: {
    initialQueueView?: string | null;
  }) => (
    <div data-testid="queue-command-center">
      Queue command center:{initialQueueView ?? "none"}
    </div>
  ),
}));

describe("InboxPage", () => {
  it("always renders the queue command center wrapper", () => {
    render(
      <InboxPage
        onLoadDraft={vi.fn()}
        initialQueueView="at_risk"
        onQueueViewConsumed={vi.fn()}
      />,
    );

    expect(screen.getByTestId("queue-command-center").textContent).toContain(
      "Queue command center:at_risk",
    );
  });
});
