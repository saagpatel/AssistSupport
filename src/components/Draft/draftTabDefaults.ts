import type {
  GuidedRunbookTemplate,
  WorkspacePersonalization,
} from "../../types/workspace";

export const DRAFT_PANEL_DENSITY_STORAGE_KEY = "draft-panel-density-mode";

export const WORKSPACE_PERSONALIZATION_STORAGE_KEY =
  "assistsupport.workspace.personalization.v1";

export const DEFAULT_WORKSPACE_PERSONALIZATION: WorkspacePersonalization = {
  preferred_note_audience: "internal-note",
  preferred_output_length: "Medium",
  favorite_queue_view: "all",
  default_evidence_format: "clipboard",
};

export const DEFAULT_RUNBOOK_TEMPLATES: Array<
  Omit<GuidedRunbookTemplate, "id">
> = [
  {
    name: "Security Incident",
    scenario: "security-incident",
    steps: [
      "Acknowledge the incident",
      "Confirm scope and impacted users",
      "Contain access or affected systems",
      "Notify stakeholders",
      "Prepare escalation or recovery note",
    ],
  },
  {
    name: "Access Request Review",
    scenario: "access-request",
    steps: [
      "Confirm requester identity",
      "Check policy or entitlement path",
      "Verify required approver",
      "Document evidence and approval state",
      "Communicate approved or denied outcome",
    ],
  },
  {
    name: "Device Troubleshooting",
    scenario: "device-troubleshooting",
    steps: [
      "Capture symptoms and environment",
      "Verify recent changes",
      "Run standard checks or reboot path",
      "Collect logs or screenshots",
      "Escalate with evidence if unresolved",
    ],
  },
];

export function loadWorkspacePersonalization(): WorkspacePersonalization {
  if (typeof window === "undefined") {
    return DEFAULT_WORKSPACE_PERSONALIZATION;
  }

  try {
    const raw = window.localStorage.getItem(
      WORKSPACE_PERSONALIZATION_STORAGE_KEY,
    );
    if (!raw) {
      return DEFAULT_WORKSPACE_PERSONALIZATION;
    }

    const parsed = JSON.parse(raw) as Partial<WorkspacePersonalization>;
    return {
      preferred_note_audience:
        parsed.preferred_note_audience ??
        DEFAULT_WORKSPACE_PERSONALIZATION.preferred_note_audience,
      preferred_output_length:
        parsed.preferred_output_length ??
        DEFAULT_WORKSPACE_PERSONALIZATION.preferred_output_length,
      favorite_queue_view:
        parsed.favorite_queue_view ??
        DEFAULT_WORKSPACE_PERSONALIZATION.favorite_queue_view,
      default_evidence_format:
        parsed.default_evidence_format ??
        DEFAULT_WORKSPACE_PERSONALIZATION.default_evidence_format,
    };
  } catch {
    return DEFAULT_WORKSPACE_PERSONALIZATION;
  }
}

function createWorkspaceScopeSeed(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `workspace-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createWorkspaceRunbookScopeKey(): string {
  return `workspace:${createWorkspaceScopeSeed()}`;
}

export type DraftPanelDensityMode =
  | "balanced"
  | "focus-intake"
  | "focus-response";

export function readPanelDensityMode(): DraftPanelDensityMode {
  if (typeof window === "undefined") {
    return "balanced";
  }
  const stored = window.localStorage.getItem(DRAFT_PANEL_DENSITY_STORAGE_KEY);
  if (
    stored === "balanced" ||
    stored === "focus-intake" ||
    stored === "focus-response"
  ) {
    return stored;
  }
  return "balanced";
}
