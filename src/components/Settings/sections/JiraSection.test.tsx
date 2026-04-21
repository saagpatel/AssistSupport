// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JiraSection } from "./JiraSection";

describe("JiraSection", () => {
  afterEach(() => cleanup());

  it("submits the form with the entered credentials when not configured", async () => {
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

    fireEvent.change(screen.getByLabelText("Jira URL"), {
      target: { value: "https://example.atlassian.net" },
    });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "dev@example.com" },
    });
    fireEvent.change(screen.getByLabelText("API Token"), {
      target: { value: "secret-token" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));

    await waitFor(() =>
      expect(onJiraConnect).toHaveBeenCalledWith(
        "https://example.atlassian.net",
        "dev@example.com",
        "secret-token",
      ),
    );
  });

  it("renders the connected state and triggers disconnect when Disconnect is clicked", () => {
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
    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    expect(onJiraDisconnect).toHaveBeenCalledTimes(1);
  });
});
