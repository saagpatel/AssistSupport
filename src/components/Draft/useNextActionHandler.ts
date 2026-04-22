import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import { compactLines } from "../../features/workspace/workspaceAssistant";
import type {
  CaseIntake,
  GuidedRunbookTemplate,
  MissingQuestion,
  NextActionRecommendation,
} from "../../types/workspace";
import type { DraftPanelDensityMode } from "./draftTabDefaults";

export interface UseNextActionHandlerOptions {
  // State reads
  currentTicketId: string | null;
  currentTicketSummary: string | undefined;
  diagnosticNotes: string;
  input: string;
  caseIntakeIssue: string | null | undefined;
  missingQuestions: MissingQuestion[];
  runbookTemplates: GuidedRunbookTemplate[];

  // State writers
  setDiagnosticNotes: Dispatch<SetStateAction<string>>;
  setPanelDensityMode: (mode: DraftPanelDensityMode) => void;
  setApprovalQuery: (value: string) => void;
  setCaseIntake: Dispatch<SetStateAction<CaseIntake>>;

  // Cross-hook handlers we delegate to
  handleGenerate: () => unknown;
  handleStartGuidedRunbook: (templateId: string) => unknown;
  handleCopyKbDraft: () => unknown;

  // Observability + UX
  logEvent: (event: string, payload?: Record<string, unknown>) => unknown;
  onShowSuccess: (message: string) => void;
}

/**
 * Handles the user's acceptance of a next-best-action recommendation. Each
 * action kind routes to a different workspace side effect — triggering
 * generation, primer notes, approval search seed, guided runbook kickoff,
 * escalation-note mode, or a default KB draft copy.
 *
 * Extracted from DraftTab so the ~90-line switch lives next to the hook
 * family instead of inflating the orchestrator component.
 */
export function useNextActionHandler({
  currentTicketId,
  currentTicketSummary,
  diagnosticNotes,
  input,
  caseIntakeIssue,
  missingQuestions,
  runbookTemplates,
  setDiagnosticNotes,
  setPanelDensityMode,
  setApprovalQuery,
  setCaseIntake,
  handleGenerate,
  handleStartGuidedRunbook,
  handleCopyKbDraft,
  logEvent,
  onShowSuccess,
}: UseNextActionHandlerOptions) {
  return useCallback(
    (action: NextActionRecommendation) => {
      void logEvent("workspace_next_action_accepted", {
        ticket_id: currentTicketId,
        action_kind: action.kind,
        action_id: action.id,
      });

      if (action.kind === "answer") {
        void handleGenerate();
        return;
      }

      if (action.kind === "clarify") {
        const clarifyPrompt = compactLines([
          diagnosticNotes,
          "Clarifying questions to ask:",
          ...missingQuestions.map((question) => `- ${question.question}`),
        ]);
        setDiagnosticNotes(clarifyPrompt);
        setPanelDensityMode("focus-intake");
        onShowSuccess("Added clarifying questions to the diagnostic notes");
        return;
      }

      if (action.kind === "approval") {
        const querySeed = compactLines([
          caseIntakeIssue,
          currentTicketSummary,
          input,
        ]);
        setApprovalQuery(`${querySeed || "support request"} policy approval`);
        setPanelDensityMode("focus-intake");
        onShowSuccess("Primed the approval search query");
        return;
      }

      if (action.kind === "runbook") {
        setPanelDensityMode("focus-intake");
        setDiagnosticNotes((prev) =>
          compactLines([
            prev,
            "Runbook kickoff:",
            `- ${action.rationale}`,
            ...action.prerequisites.map((item) => `- ${item}`),
          ]),
        );
        const incidentTemplate = runbookTemplates.find((template) =>
          /incident|security/i.test(`${template.name} ${template.scenario}`),
        );
        if (incidentTemplate) {
          void handleStartGuidedRunbook(incidentTemplate.id);
        }
        onShowSuccess("Prepared the workspace for guided runbook steps");
        return;
      }

      if (action.kind === "escalate") {
        setCaseIntake((prev) => ({
          ...prev,
          note_audience: "escalation-note",
        }));
        setDiagnosticNotes((prev) =>
          compactLines([prev, "Escalation focus:", `- ${action.rationale}`]),
        );
        onShowSuccess("Switched the workspace into escalation-note mode");
        return;
      }

      void handleCopyKbDraft();
    },
    [
      logEvent,
      currentTicketId,
      handleGenerate,
      diagnosticNotes,
      missingQuestions,
      onShowSuccess,
      caseIntakeIssue,
      currentTicketSummary,
      input,
      runbookTemplates,
      handleStartGuidedRunbook,
      handleCopyKbDraft,
      setDiagnosticNotes,
      setPanelDensityMode,
      setApprovalQuery,
      setCaseIntake,
    ],
  );
}
