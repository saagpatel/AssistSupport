import { useCallback, useState } from "react";
import { compactLines } from "../../features/workspace/workspaceAssistant";
import type {
  GuidedRunbookSession,
  GuidedRunbookTemplate,
} from "../../types/workspace";

type PanelDensityMode = "balanced" | "focus-intake" | "focus-response";

interface UseGuidedRunbookOptions {
  runbookTemplates: GuidedRunbookTemplate[];
  guidedRunbookSession: GuidedRunbookSession | null;
  workspaceRunbookScopeKey: string;
  currentTicketId: string | null;
  startRunbookSession: (
    scenario: string,
    steps: string[],
    scopeKey: string,
  ) => Promise<unknown>;
  addRunbookStepEvidence: (
    sessionId: string,
    stepIndex: number,
    status: "completed" | "skipped" | "failed",
    evidenceText: string,
    skipReason?: string,
  ) => Promise<unknown>;
  advanceRunbookSession: (
    sessionId: string,
    nextStep: number,
    nextStatus: "active" | "paused" | "completed",
  ) => Promise<unknown>;
  refreshWorkspaceCatalog: () => Promise<unknown>;
  logEvent: (event: string, payload?: Record<string, unknown>) => unknown;
  setDiagnosticNotes: (updater: (prev: string) => string) => void;
  setPanelDensityMode: (mode: PanelDensityMode) => void;
  setRunbookSessionSourceScopeKey: (key: string | null) => void;
  setRunbookSessionTouched: (touched: boolean) => void;
  onShowSuccess: (message: string) => void;
  onShowError: (message: string) => void;
}

export function useGuidedRunbook({
  runbookTemplates,
  guidedRunbookSession,
  workspaceRunbookScopeKey,
  currentTicketId,
  startRunbookSession,
  addRunbookStepEvidence,
  advanceRunbookSession,
  refreshWorkspaceCatalog,
  logEvent,
  setDiagnosticNotes,
  setPanelDensityMode,
  setRunbookSessionSourceScopeKey,
  setRunbookSessionTouched,
  onShowSuccess,
  onShowError,
}: UseGuidedRunbookOptions) {
  const [guidedRunbookNote, setGuidedRunbookNote] = useState("");

  const handleStartGuidedRunbook = useCallback(
    async (templateId: string) => {
      const template = runbookTemplates.find((item) => item.id === templateId);
      if (!template) {
        onShowError("Choose a guided runbook template first");
        return;
      }
      if (guidedRunbookSession && guidedRunbookSession.status !== "completed") {
        onShowError(
          "Finish the current guided runbook before starting another one",
        );
        return;
      }

      try {
        await startRunbookSession(
          template.scenario,
          template.steps,
          workspaceRunbookScopeKey,
        );
        setGuidedRunbookNote("");
        setRunbookSessionSourceScopeKey(workspaceRunbookScopeKey);
        setRunbookSessionTouched(true);
        await refreshWorkspaceCatalog();
        setPanelDensityMode("focus-intake");
        void logEvent("workspace_guided_runbook_started", {
          ticket_id: currentTicketId,
          template_id: template.id,
          scenario: template.scenario,
        });
        onShowSuccess(`Started ${template.name}`);
      } catch {
        onShowError("Failed to start guided runbook");
      }
    },
    [
      runbookTemplates,
      startRunbookSession,
      refreshWorkspaceCatalog,
      workspaceRunbookScopeKey,
      guidedRunbookSession,
      logEvent,
      currentTicketId,
      setPanelDensityMode,
      setRunbookSessionSourceScopeKey,
      setRunbookSessionTouched,
      onShowSuccess,
      onShowError,
    ],
  );

  const handleAdvanceGuidedRunbook = useCallback(
    async (status: "completed" | "skipped" | "failed") => {
      if (!guidedRunbookSession) {
        onShowError("Start a guided runbook before updating a step");
        return;
      }

      const currentStep = guidedRunbookSession.current_step;
      const stepLabel =
        guidedRunbookSession.steps[currentStep] ?? `Step ${currentStep + 1}`;
      const noteText = guidedRunbookNote.trim();
      const evidenceText = noteText || `${status} · ${stepLabel}`;
      const skipReason =
        status === "skipped" ? noteText || "Skipped from workspace" : undefined;
      const nextStep =
        status === "failed"
          ? currentStep
          : Math.min(
              currentStep + 1,
              Math.max(guidedRunbookSession.steps.length - 1, 0),
            );
      const nextStatus =
        status === "failed"
          ? "paused"
          : currentStep >= guidedRunbookSession.steps.length - 1
            ? "completed"
            : "active";

      try {
        await addRunbookStepEvidence(
          guidedRunbookSession.id,
          currentStep,
          status,
          evidenceText,
          skipReason,
        );
        await advanceRunbookSession(
          guidedRunbookSession.id,
          nextStep,
          nextStatus,
        );
        setRunbookSessionTouched(true);
        if (noteText) {
          setDiagnosticNotes((prev) =>
            compactLines([prev, `Runbook ${stepLabel}: ${noteText}`]),
          );
        }
        setGuidedRunbookNote("");
        await refreshWorkspaceCatalog();
        void logEvent("workspace_guided_runbook_step_recorded", {
          ticket_id: currentTicketId,
          session_id: guidedRunbookSession.id,
          step_index: currentStep,
          status,
        });
        onShowSuccess(
          status === "failed"
            ? `Paused the runbook at ${stepLabel}`
            : nextStatus === "completed"
              ? "Guided runbook completed"
              : `Recorded ${stepLabel}`,
        );
      } catch {
        onShowError("Failed to update guided runbook progress");
      }
    },
    [
      guidedRunbookSession,
      guidedRunbookNote,
      addRunbookStepEvidence,
      advanceRunbookSession,
      refreshWorkspaceCatalog,
      currentTicketId,
      logEvent,
      setDiagnosticNotes,
      setRunbookSessionTouched,
      onShowSuccess,
      onShowError,
    ],
  );

  const handleCopyRunbookProgressToNotes = useCallback(() => {
    if (!guidedRunbookSession || guidedRunbookSession.evidence.length === 0) {
      onShowError("No guided runbook progress to copy yet");
      return;
    }

    const progressText = compactLines([
      `Guided runbook: ${guidedRunbookSession.scenario}`,
      ...guidedRunbookSession.evidence.map((item) => {
        const stepLabel =
          guidedRunbookSession.steps[item.step_index] ??
          `Step ${item.step_index + 1}`;
        return `- ${stepLabel}: ${item.status}${item.evidence_text ? ` · ${item.evidence_text}` : ""}`;
      }),
    ]);

    setDiagnosticNotes((prev) => compactLines([prev, progressText]));
    onShowSuccess("Copied guided runbook progress into the notes");
  }, [guidedRunbookSession, setDiagnosticNotes, onShowError, onShowSuccess]);

  const handleGuidedRunbookNoteChange = useCallback(
    (value: string) => {
      setGuidedRunbookNote(value);
      if (value.trim()) {
        setRunbookSessionTouched(true);
      }
    },
    [setRunbookSessionTouched],
  );

  return {
    guidedRunbookNote,
    setGuidedRunbookNote,
    handleStartGuidedRunbook,
    handleAdvanceGuidedRunbook,
    handleCopyRunbookProgressToNotes,
    handleGuidedRunbookNoteChange,
  };
}
