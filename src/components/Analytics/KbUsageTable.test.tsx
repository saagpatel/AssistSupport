// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KbUsageTable } from "./KbUsageTable";

const articles = [
  { document_id: "doc-1", title: "Remote Work Policy", usage_count: 12 },
  { document_id: "doc-2", title: "VPN Setup Guide", usage_count: 7 },
];

describe("KbUsageTable", () => {
  afterEach(() => cleanup());

  it("renders an empty state when there are no articles", () => {
    render(<KbUsageTable articles={[]} />);
    expect(screen.getByText("No article usage data yet")).toBeTruthy();
  });

  it("fires onArticleClick with the document_id when a row is clicked", async () => {
    const user = userEvent.setup();
    const onArticleClick = vi.fn();
    render(
      <KbUsageTable articles={articles} onArticleClick={onArticleClick} />,
    );

    await user.click(screen.getByText("VPN Setup Guide"));
    expect(onArticleClick).toHaveBeenCalledWith("doc-2");
  });
});
