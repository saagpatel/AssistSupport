import type { CaseIntake } from "../../types/workspace";
import type { JiraTicketContext } from "../../types/llm";
import {
  extractSection,
  firstNonEmpty,
  normalizeText,
} from "./workspaceAssistantText";

export const DEFAULT_NOTE_AUDIENCE = "internal-note" as const;

export function inferUrgency(
  inputText: string,
  ticket?: JiraTicketContext | null,
): CaseIntake["urgency"] {
  const haystack =
    `${inputText}\n${ticket?.summary ?? ""}\n${ticket?.priority ?? ""}`.toLowerCase();
  if (/\b(sev1|p1|critical|urgent|outage|production down)\b/.test(haystack)) {
    return "critical";
  }
  if (
    /\b(sev2|p2|high|major|blocked|cannot access|cannot login|can'?t log in)\b/.test(
      haystack,
    )
  ) {
    return "high";
  }
  if (/\b(low priority|minor|when possible)\b/.test(haystack)) {
    return "low";
  }
  return "normal";
}

export function inferCategory(inputText: string): string {
  const haystack = inputText.toLowerCase();
  if (/\b(outage|incident|sev|degraded|down)\b/.test(haystack)) {
    return "incident";
  }
  if (/\b(access|permission|entitlement|request access)\b/.test(haystack)) {
    return "access";
  }
  if (/\b(change|rollout|deployment|release|maintenance)\b/.test(haystack)) {
    return "change-rollout";
  }
  if (
    /\b(laptop|device|computer|desktop|monitor|printer|phone|ios|android|windows|mac)\b/.test(
      haystack,
    )
  ) {
    return "device-environment";
  }
  if (
    /\b(policy|allowed|approval|approve|forbidden|compliance)\b/.test(haystack)
  ) {
    return "policy-approval";
  }
  return "general-support";
}

export function buildMissingData(intake: CaseIntake): string[] {
  const missing: string[] = [];
  if (!normalizeText(intake.issue)) {
    missing.push("issue summary");
  }
  if (!normalizeText(intake.impact)) {
    missing.push("customer or business impact");
  }
  if (!normalizeText(intake.affected_system)) {
    missing.push("affected system");
  }
  if (!normalizeText(intake.steps_tried)) {
    missing.push("steps already tried");
  }
  if (!normalizeText(intake.blockers)) {
    missing.push("current blocker");
  }
  return missing;
}

export function parseCaseIntake(raw: string | null | undefined): CaseIntake {
  if (!raw) {
    return {
      urgency: "normal",
      missing_data: [],
      note_audience: DEFAULT_NOTE_AUDIENCE,
      custom_fields: {},
    };
  }

  try {
    const parsed = JSON.parse(raw) as CaseIntake;
    return {
      urgency: parsed.urgency ?? "normal",
      missing_data: Array.isArray(parsed.missing_data)
        ? parsed.missing_data
        : [],
      note_audience: parsed.note_audience ?? DEFAULT_NOTE_AUDIENCE,
      custom_fields: parsed.custom_fields ?? {},
      ...parsed,
    };
  } catch {
    return {
      urgency: "normal",
      missing_data: [],
      note_audience: DEFAULT_NOTE_AUDIENCE,
      custom_fields: {},
    };
  }
}

export function serializeCaseIntake(intake: CaseIntake): string | null {
  const normalized: CaseIntake = {
    ...intake,
    urgency: intake.urgency ?? "normal",
    note_audience: intake.note_audience ?? DEFAULT_NOTE_AUDIENCE,
    missing_data: buildMissingData(intake),
    custom_fields: intake.custom_fields ?? {},
  };

  const hasMeaningfulValue = Object.entries(normalized).some(([key, value]) => {
    if (key === "missing_data") {
      return Array.isArray(value) && value.length > 0;
    }
    if (key === "custom_fields") {
      return (
        value && typeof value === "object" && Object.keys(value).length > 0
      );
    }
    return typeof value === "string" ? value.trim().length > 0 : value != null;
  });

  return hasMeaningfulValue ? JSON.stringify(normalized) : null;
}

export function analyzeCaseIntake(
  inputText: string,
  ticket?: JiraTicketContext | null,
  existingIntake?: CaseIntake | null,
): CaseIntake {
  const next: CaseIntake = {
    ...parseCaseIntake(existingIntake ? JSON.stringify(existingIntake) : null),
    issue: firstNonEmpty(
      extractSection(inputText, ["issue", "problem", "summary"]),
      ticket?.summary,
      inputText
        .split("\n")
        .map((line) => line.trim())
        .find(Boolean) ?? null,
      existingIntake?.issue,
    ),
    environment: firstNonEmpty(
      extractSection(inputText, ["environment", "system", "application"]),
      existingIntake?.environment,
    ),
    impact: firstNonEmpty(
      extractSection(inputText, [
        "impact",
        "business impact",
        "customer/business impact",
      ]),
      existingIntake?.impact,
    ),
    urgency: existingIntake?.urgency ?? inferUrgency(inputText, ticket),
    affected_user: firstNonEmpty(
      extractSection(inputText, ["affected user", "requestor", "user"]),
      ticket?.reporter,
      existingIntake?.affected_user,
    ),
    affected_system: firstNonEmpty(
      extractSection(inputText, [
        "affected system",
        "system/resource",
        "service",
      ]),
      existingIntake?.affected_system,
    ),
    affected_site: firstNonEmpty(
      extractSection(inputText, ["site", "location", "region"]),
      existingIntake?.affected_site,
    ),
    symptoms: firstNonEmpty(
      extractSection(inputText, ["symptoms", "symptom description"]),
      existingIntake?.symptoms,
      inputText.slice(0, 300),
    ),
    steps_tried: firstNonEmpty(
      extractSection(inputText, [
        "steps already attempted",
        "actions already attempted",
        "steps tried",
        "actions taken",
      ]),
      existingIntake?.steps_tried,
    ),
    blockers: firstNonEmpty(
      extractSection(inputText, [
        "current blocker / escalation needed",
        "current blocker",
        "blocker / escalation needed",
        "blocker",
      ]),
      existingIntake?.blockers,
    ),
    likely_category:
      existingIntake?.likely_category ?? inferCategory(inputText),
    note_audience: existingIntake?.note_audience ?? DEFAULT_NOTE_AUDIENCE,
    device: firstNonEmpty(
      extractSection(inputText, ["device", "device type/model"]),
      existingIntake?.device,
    ),
    os: firstNonEmpty(
      extractSection(inputText, ["os", "operating system"]),
      existingIntake?.os,
    ),
    reproduction: firstNonEmpty(
      extractSection(inputText, ["reproduction", "steps to reproduce"]),
      existingIntake?.reproduction,
    ),
    logs: firstNonEmpty(
      extractSection(inputText, ["logs", "log snippets"]),
      existingIntake?.logs,
    ),
    custom_fields: existingIntake?.custom_fields ?? {},
  };

  next.missing_data = buildMissingData(next);
  return next;
}
