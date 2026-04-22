// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KnowledgePage } from "./KnowledgePage";

vi.mock("../../components/shared/Button", () => ({
  Button: ({
    children,
    onClick,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" onClick={onClick} {...props}>
      {children}
    </button>
  ),
}));

vi.mock("../sources", () => ({
  SourcesPage: ({
    initialSearchQuery,
  }: {
    initialSearchQuery?: string | null;
    onSearchQueryConsumed?: () => void;
  }) => <div>Sources page {initialSearchQuery ?? "empty"}</div>,
}));

vi.mock("../../components/Knowledge", () => ({
  KnowledgeBrowser: () => <div>Knowledge browser</div>,
}));

vi.mock("../../components/Search", () => ({
  HybridSearchTab: () => <div>Hybrid search diagnostics</div>,
}));

afterEach(() => {
  cleanup();
});

describe("KnowledgePage", () => {
  it("starts on the documents section so source management stays reachable", () => {
    render(<KnowledgePage />);

    expect(
      screen
        .getByRole("tab", { name: "Documents" })
        .getAttribute("aria-selected"),
    ).toBe("true");
    expect(screen.getByText("Sources page empty")).toBeTruthy();
    expect(screen.queryByText("Knowledge browser")).toBeNull();
    expect(screen.queryByText("Hybrid search diagnostics")).toBeNull();
  });

  it("keeps the documents workspace visible while opening library and diagnostics tools", async () => {
    const user = userEvent.setup();
    render(<KnowledgePage />);

    await user.click(screen.getByRole("tab", { name: "Library" }));
    expect(screen.getByText("Sources page empty")).toBeTruthy();
    expect(screen.getByText("Knowledge browser")).toBeTruthy();

    await user.click(screen.getByRole("tab", { name: "Search Diagnostics" }));
    expect(screen.getByText("Sources page empty")).toBeTruthy();
    expect(screen.getByText("Hybrid search diagnostics")).toBeTruthy();
  });

  it("routes workspace search handoff into the documents section with the query intact", () => {
    render(<KnowledgePage initialSearchQuery="vpn policy" />);

    expect(
      screen
        .getByRole("tab", { name: "Documents" })
        .getAttribute("aria-selected"),
    ).toBe("true");
    expect(screen.getByText("Sources page vpn policy")).toBeTruthy();
  });

  it("returns to the documents section when a fresh workspace search handoff arrives", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<KnowledgePage />);

    await user.click(screen.getByRole("tab", { name: "Search Diagnostics" }));
    expect(screen.getByText("Hybrid search diagnostics")).toBeTruthy();

    rerender(<KnowledgePage initialSearchQuery="reset password" />);

    expect(
      screen
        .getByRole("tab", { name: "Documents" })
        .getAttribute("aria-selected"),
    ).toBe("true");
    expect(screen.getByText("Sources page reset password")).toBeTruthy();
    expect(screen.queryByText("Hybrid search diagnostics")).toBeNull();
  });
});
