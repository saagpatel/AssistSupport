import { useCallback, useState } from "react";
import type { JiraTicket } from "../../hooks/useJira";
import type {
  CaseIntake,
  NoteAudience,
  WorkspacePersonalization,
} from "../../types/workspace";
import {
  analyzeCaseIntake,
  parseCaseIntake,
} from "../../features/workspace/workspaceAssistant";

export type IntakePreset = "incident" | "access" | "rollout" | "device";

export const INTAKE_PRESETS: Record<IntakePreset, Partial<CaseIntake>> = {
  incident: {
    likely_category: "incident",
    urgency: "high",
    note_audience: "internal-note",
  },
  access: {
    likely_category: "access",
    urgency: "normal",
    note_audience: "internal-note",
  },
  rollout: {
    likely_category: "change-rollout",
    urgency: "normal",
    note_audience: "internal-note",
  },
  device: {
    likely_category: "device-environment",
    urgency: "normal",
    note_audience: "internal-note",
  },
};

interface UseDraftIntakeOptions {
  initialNoteAudience: NoteAudience;
  input: string;
  currentTicket: JiraTicket | null;
  currentTicketId: string | null;
  response: string;
  logEvent: (event: string, payload?: Record<string, unknown>) => Promise<void>;
  setWorkspacePersonalization: (
    updater: (prev: WorkspacePersonalization) => WorkspacePersonalization,
  ) => void;
}

export function useDraftIntake({
  initialNoteAudience,
  input,
  currentTicket,
  currentTicketId,
  response,
  logEvent,
  setWorkspacePersonalization,
}: UseDraftIntakeOptions) {
  const [caseIntake, setCaseIntake] = useState<CaseIntake>(() => ({
    ...parseCaseIntake(null),
    note_audience: initialNoteAudience,
  }));

  const handleIntakeFieldChange = useCallback(
    (field: keyof CaseIntake, value: string) => {
      setCaseIntake((prev) => ({
        ...prev,
        [field]: value,
      }));
    },
    [],
  );

  const handleAnalyzeIntake = useCallback(() => {
    setCaseIntake((prev) =>
      analyzeCaseIntake(input, currentTicket ?? undefined, prev),
    );
    void logEvent("workspace_intake_analyzed", {
      ticket_id: currentTicketId,
      has_ticket: Boolean(currentTicketId),
      has_response: Boolean(response.trim()),
    });
  }, [input, currentTicket, logEvent, currentTicketId, response]);

  const handleApplyIntakePreset = useCallback(
    (preset: IntakePreset) => {
      setCaseIntake((prev) => ({
        ...prev,
        ...INTAKE_PRESETS[preset],
      }));
      void logEvent("workspace_intake_preset_applied", { preset });
    },
    [logEvent],
  );

  const handleNoteAudienceChange = useCallback(
    (audience: NoteAudience) => {
      setCaseIntake((prev) => ({
        ...prev,
        note_audience: audience,
      }));
      setWorkspacePersonalization((prev) => ({
        ...prev,
        preferred_note_audience: audience,
      }));
      void logEvent("workspace_note_audience_changed", { audience });
    },
    [logEvent, setWorkspacePersonalization],
  );

  return {
    caseIntake,
    setCaseIntake,
    handleIntakeFieldChange,
    handleAnalyzeIntake,
    handleApplyIntakePreset,
    handleNoteAudienceChange,
  };
}
