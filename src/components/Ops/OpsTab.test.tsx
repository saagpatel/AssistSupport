// @vitest-environment jsdom
import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OpsTab } from "./OpsTab";

const showSuccess = vi.fn();
const showError = vi.fn();

const getDeploymentHealthSummary = vi.fn();
const runDeploymentPreflight = vi.fn();
const listDeploymentArtifacts = vi.fn();
const recordDeploymentArtifact = vi.fn();
const verifySignedArtifact = vi.fn();
const rollbackDeploymentRun = vi.fn();
const listIntegrations = vi.fn();
const configureIntegration = vi.fn();

vi.mock("../../contexts/ToastContext", () => ({
  useToastContext: () => ({
    success: showSuccess,
    error: showError,
  }),
}));

vi.mock("../../hooks/useSettingsOps", () => ({
  useSettingsOps: () => ({
    getDeploymentHealthSummary,
    runDeploymentPreflight,
    listDeploymentArtifacts,
    recordDeploymentArtifact,
    verifySignedArtifact,
    rollbackDeploymentRun,
    listIntegrations,
    configureIntegration,
  }),
}));

vi.mock("../shared/Button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    loading: _loading,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) => (
    <button type="button" onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}));

beforeEach(() => {
  getDeploymentHealthSummary.mockResolvedValue(null);
  runDeploymentPreflight.mockResolvedValue({ ok: true, checks: [] });
  listDeploymentArtifacts.mockResolvedValue([]);
  recordDeploymentArtifact.mockResolvedValue("artifact-1");
  verifySignedArtifact.mockResolvedValue({
    status: "verified",
    artifact: { version: "1.0.0" },
  });
  rollbackDeploymentRun.mockResolvedValue(undefined);
  listIntegrations.mockResolvedValue([]);
  configureIntegration.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  showSuccess.mockReset();
  showError.mockReset();
  getDeploymentHealthSummary.mockReset();
  runDeploymentPreflight.mockReset();
  listDeploymentArtifacts.mockReset();
  recordDeploymentArtifact.mockReset();
  verifySignedArtifact.mockReset();
  rollbackDeploymentRun.mockReset();
  listIntegrations.mockReset();
  configureIntegration.mockReset();
});

describe("OpsTab", () => {
  it("shows only deployment and integrations in the active UI navigation", async () => {
    render(<OpsTab />);

    expect(await screen.findByRole("tab", { name: "Deployment" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Integrations" })).toBeTruthy();
    expect(screen.queryByRole("tab", { name: "Eval Harness" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "Triage" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "Runbook" })).toBeNull();
    expect(
      screen.getByText("Deployment health is not available yet."),
    ).toBeTruthy();
    expect(
      screen.getByText("No deployment artifacts recorded yet."),
    ).toBeTruthy();
  });

  it("keeps the record artifact action disabled until a sha is provided", async () => {
    render(<OpsTab />);

    const recordButton = await screen.findByRole("button", {
      name: "Record Artifact",
    });
    expect((recordButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText("sha256"), {
      target: { value: "abc123" },
    });
    expect(
      (
        screen.getByRole("button", {
          name: "Record Artifact",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });

  it("shows integration controls and surfaces config errors through the toast channel", async () => {
    configureIntegration.mockRejectedValue(new Error("bad config"));

    render(<OpsTab />);
    fireEvent.click(await screen.findByRole("tab", { name: "Integrations" }));

    const [textarea] = await screen.findAllByPlaceholderText(
      '{"webhook_url":"https://..."}',
    );
    fireEvent.change(textarea, { target: { value: "not-json" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Save Config" })[0]);

    await waitFor(() => {
      expect(showError).toHaveBeenCalled();
    });
  });
});
