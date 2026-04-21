export const APP_BOOTSTRAP_START_MARK = "assistsupport:perf:bootstrap-start";
export const TICKET_WORKSPACE_READY_MARK =
  "assistsupport:perf:ticket-workspace-ready";
export const TICKET_WORKSPACE_READY_MEASURE =
  "assistsupport:perf:ticket-workspace-ready-ms";

type PerfWindow = Window & {
  __assistsupportPerf?: {
    bootstrapStartedAt: number;
    ticketWorkspaceReadyMs?: number;
  };
};

export function markWorkspaceReady(): void {
  if (
    typeof window === "undefined" ||
    typeof window.performance === "undefined"
  ) {
    return;
  }

  const perfWindow = window as PerfWindow;
  const bootstrapStartedAt =
    perfWindow.__assistsupportPerf?.bootstrapStartedAt ?? 0;
  perfWindow.__assistsupportPerf = {
    ...(perfWindow.__assistsupportPerf ?? { bootstrapStartedAt }),
    bootstrapStartedAt,
    ticketWorkspaceReadyMs: Number(
      (window.performance.now() - bootstrapStartedAt).toFixed(2),
    ),
  };
  window.performance.clearMarks(TICKET_WORKSPACE_READY_MARK);
  window.performance.clearMeasures(TICKET_WORKSPACE_READY_MEASURE);
  window.performance.mark(TICKET_WORKSPACE_READY_MARK);
  try {
    window.performance.measure(
      TICKET_WORKSPACE_READY_MEASURE,
      APP_BOOTSTRAP_START_MARK,
      TICKET_WORKSPACE_READY_MARK,
    );
  } catch {
    // Keep the workspace usable even if performance marks are unavailable in the current runtime.
  }
}
