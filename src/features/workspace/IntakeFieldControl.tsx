import type { NoteAudience } from "../../types/workspace";

export type IntakeField =
  | "issue"
  | "environment"
  | "impact"
  | "affected_user"
  | "affected_system"
  | "affected_site"
  | "symptoms"
  | "steps_tried"
  | "blockers"
  | "likely_category";

export const NOTE_AUDIENCES: Array<{ id: NoteAudience; label: string }> = [
  { id: "internal-note", label: "Internal note" },
  { id: "customer-safe", label: "Customer-safe" },
  { id: "escalation-note", label: "Escalation note" },
];

export const INTAKE_FIELDS: Array<{
  key: IntakeField;
  label: string;
  rows?: number;
}> = [
  { key: "issue", label: "Issue summary" },
  { key: "environment", label: "Environment" },
  { key: "impact", label: "Impact", rows: 2 },
  { key: "affected_user", label: "Affected user" },
  { key: "affected_system", label: "Affected system" },
  { key: "affected_site", label: "Affected site" },
  { key: "symptoms", label: "Symptoms", rows: 3 },
  { key: "steps_tried", label: "Steps already tried", rows: 3 },
  { key: "blockers", label: "Current blocker", rows: 2 },
  { key: "likely_category", label: "Likely category" },
];

interface IntakeFieldControlProps {
  label: string;
  value: string;
  rows?: number;
  onChange: (value: string) => void;
}

export function IntakeFieldControl({
  label,
  value,
  rows,
  onChange,
}: IntakeFieldControlProps) {
  if (rows && rows > 1) {
    return (
      <label className="ticket-workspace-rail__field">
        <span>{label}</span>
        <textarea
          rows={rows}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
    );
  }

  return (
    <label className="ticket-workspace-rail__field">
      <span>{label}</span>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
