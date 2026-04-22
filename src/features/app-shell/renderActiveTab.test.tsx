// @vitest-environment jsdom
import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderActiveTab } from "./renderActiveTab";
import type { DraftTabHandle } from "../../components/Draft/DraftTab";

vi.mock("../workspace", () => ({
  WorkspacePage: () => <div data-testid="workspace-page">workspace-page</div>,
}));

vi.mock("../inbox", () => ({
  InboxPage: ({ initialQueueView }: { initialQueueView?: string | null }) => (
    <div data-testid="queue-page">{initialQueueView ?? "no-queue-view"}</div>
  ),
}));

vi.mock("../knowledge", () => ({
  KnowledgePage: ({
    initialSearchQuery,
  }: {
    initialSearchQuery?: string | null;
  }) => (
    <div data-testid="knowledge-page">
      {initialSearchQuery ?? "no-search-query"}
    </div>
  ),
}));

vi.mock("../analytics", () => ({
  AnalyticsPage: ({ initialSection }: { initialSection?: string }) => (
    <div data-testid="analytics-page">{initialSection ?? "overview"}</div>
  ),
}));

vi.mock("../settings", () => ({
  SettingsPage: () => <div data-testid="settings-page">settings</div>,
}));

vi.mock("../ops", () => ({
  OpsPage: () => <div data-testid="ops-page">ops</div>,
}));

function renderTab(
  activeTab: Parameters<typeof renderActiveTab>[0]["activeTab"],
) {
  const draftRef = createRef<DraftTabHandle>();
  render(
    renderActiveTab({
      activeTab,
      draftRef,
      sourceSearchQuery: "vpn policy",
      pendingQueueView: "at_risk",
      onSearchQueryConsumed: vi.fn(),
      onQueueViewConsumed: vi.fn(),
      onNavigateToSource: vi.fn(),
      onLoadDraft: vi.fn(),
    }),
  );
}

describe("renderActiveTab", () => {
  it("routes the surviving workspace tab to the revamp workspace page", () => {
    renderTab("draft");

    expect(screen.getByTestId("workspace-page").textContent).toBe(
      "workspace-page",
    );
  });

  it("routes knowledge to the unified knowledge destination", () => {
    renderTab("knowledge");

    expect(screen.getByTestId("knowledge-page").textContent).toBe("vpn policy");
  });

  it("routes analytics directly to the insights overview", () => {
    renderTab("analytics");

    expect(screen.getByTestId("analytics-page").textContent).toBe("overview");
  });
});
