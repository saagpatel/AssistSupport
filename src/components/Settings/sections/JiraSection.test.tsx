// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JiraSection } from "./JiraSection";

describe("JiraSection", () => {
  afterEach(() => cleanup());

  it("submits the form with the entered credentials when not configured", async () => {
    const user = userEvent.setup();
    const onJiraConnect = vi.fn().mockResolvedValue(undefined);
    render(
      <JiraSection
        jiraConfigured={false}
        jiraConfig={null}
        jiraLoading={false}
        onJiraConnect={onJiraConnect}
        onJiraDisconnect={vi.fn()}
      />,
    );

    await user.type(
      screen.getByLabelText("Jira URL"),
      "https://example.atlassian.net",
    );
    await user.type(screen.getByLabelText("Email"), "dev@example.com");
    await user.type(screen.getByLabelText("API Token"), "secret-token");
    await user.click(screen.getByRole("button", { name: "Connect" }));

    await waitFor(() =>
      expect(onJiraConnect).toHaveBeenCalledWith(
        "https://example.atlassian.net",
        "dev@example.com",
        "secret-token",
      ),
    );
  });

  it("renders the connected state and triggers disconnect when Disconnect is clicked", async () => {
    const user = userEvent.setup();
    const onJiraDisconnect = vi.fn();
    render(
      <JiraSection
        jiraConfigured={true}
        jiraConfig={{
          base_url: "https://example.atlassian.net",
          email: "dev@example.com",
        }}
        jiraLoading={false}
        onJiraConnect={vi.fn()}
        onJiraDisconnect={onJiraDisconnect}
      />,
    );

    expect(
      screen.getByText("Connected to https://example.atlassian.net"),
    ).toBeTruthy();
    expect(screen.getByText("Account: dev@example.com")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Disconnect" }));
    expect(onJiraDisconnect).toHaveBeenCalledTimes(1);
  });
});
