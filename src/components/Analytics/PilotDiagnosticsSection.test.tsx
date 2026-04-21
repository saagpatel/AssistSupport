// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PilotDiagnosticsSection } from "./PilotDiagnosticsSection";

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

vi.mock("../Pilot", () => ({
  PilotDashboard: ({
    pilotLoggingEnabled,
  }: {
    pilotLoggingEnabled: boolean;
  }) => (
    <div data-testid="pilot-dashboard">
      enabled:{String(pilotLoggingEnabled)}
    </div>
  ),
  PilotQueryTester: ({
    pilotLoggingEnabled,
  }: {
    pilotLoggingEnabled: boolean;
  }) => (
    <div data-testid="pilot-query-tester">
      enabled:{String(pilotLoggingEnabled)}
    </div>
  ),
}));

describe("PilotDiagnosticsSection", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });
  afterEach(() => cleanup());

  it("loads the pilot logging policy and passes enabled=true to children", async () => {
    invokeMock.mockResolvedValue({
      enabled: true,
      retention_days: 14,
      max_rows: 500,
    });

    render(<PilotDiagnosticsSection />);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("get_pilot_logging_policy");
    });

    await waitFor(() => {
      expect(screen.getByTestId("pilot-query-tester").textContent).toContain(
        "enabled:true",
      );
    });
  });

  it("falls back to a disabled policy when the invoke call rejects", async () => {
    invokeMock.mockRejectedValue(new Error("backend down"));

    render(<PilotDiagnosticsSection />);

    await waitFor(() => {
      expect(screen.getByTestId("pilot-dashboard").textContent).toContain(
        "enabled:false",
      );
    });
  });
});
