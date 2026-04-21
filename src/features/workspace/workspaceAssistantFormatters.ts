import type { EvidencePack, HandoffPack, KbDraft } from "../../types/workspace";
import { compactLines } from "./workspaceAssistantText";

export function formatHandoffPackForClipboard(pack: HandoffPack): string {
  return compactLines([
    `Summary: ${pack.summary}`,
    "",
    "Actions taken:",
    ...pack.actions_taken.map((action) => `- ${action}`),
    "",
    `Current blocker: ${pack.current_blocker}`,
    `Next step: ${pack.next_step}`,
    "",
    "Customer-safe update:",
    pack.customer_safe_update,
    "",
    "Escalation note:",
    pack.escalation_note,
  ]);
}

export function formatEvidencePackForClipboard(pack: EvidencePack): string {
  return compactLines([
    pack.title,
    "",
    pack.summary,
    "",
    ...pack.sections.flatMap((section) => [section.label, section.content, ""]),
  ]);
}

export function formatKbDraftForClipboard(kbDraft: KbDraft): string {
  return compactLines([
    `# ${kbDraft.title}`,
    "",
    `Summary: ${kbDraft.summary}`,
    "",
    "## Symptoms",
    kbDraft.symptoms,
    "",
    "## Environment",
    kbDraft.environment,
    "",
    "## Cause",
    kbDraft.cause,
    "",
    "## Resolution",
    kbDraft.resolution,
    "",
    "## Warnings",
    kbDraft.warnings.length > 0
      ? kbDraft.warnings.map((warning) => `- ${warning}`).join("\n")
      : "None recorded.",
    "",
    "## Prerequisites",
    kbDraft.prerequisites.length > 0
      ? kbDraft.prerequisites.map((item) => `- ${item}`).join("\n")
      : "None recorded.",
    "",
    "## Policy Links",
    kbDraft.policy_links.length > 0
      ? kbDraft.policy_links.map((item) => `- ${item}`).join("\n")
      : "None recorded.",
    "",
    "## Tags",
    kbDraft.tags.join(", "),
  ]);
}

export function parseStringArrayJson(raw: string | null | undefined): string[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}
