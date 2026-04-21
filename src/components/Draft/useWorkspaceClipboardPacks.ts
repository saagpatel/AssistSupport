import { useCallback } from "react";
import {
  formatEvidencePackForClipboard,
  formatHandoffPackForClipboard,
  formatKbDraftForClipboard,
} from "../../features/workspace/workspaceAssistant";
import type {
  CaseIntake,
  EvidencePack,
  HandoffPack,
  KbDraft,
} from "../../types/workspace";

interface SaveCaseOutcomeParams {
  draft_id: string;
  status: string;
  outcome_summary: string;
  handoff_pack_json: string;
  kb_draft_json: string;
  evidence_pack_json: string;
  tags_json: string;
}

interface UseWorkspaceClipboardPacksOptions {
  handoffPack: HandoffPack;
  evidencePack: EvidencePack;
  kbDraft: KbDraft;
  caseIntake: CaseIntake;
  savedDraftId: string | null;
  currentTicketId: string | null;
  saveCaseOutcome: (params: SaveCaseOutcomeParams) => Promise<unknown>;
  logEvent: (event: string, payload?: Record<string, unknown>) => unknown;
  onHandoffCopied: () => void;
  onShowSuccess: (message: string) => void;
  onShowError: (message: string) => void;
}

export function useWorkspaceClipboardPacks({
  handoffPack,
  evidencePack,
  kbDraft,
  caseIntake,
  savedDraftId,
  currentTicketId,
  saveCaseOutcome,
  logEvent,
  onHandoffCopied,
  onShowSuccess,
  onShowError,
}: UseWorkspaceClipboardPacksOptions) {
  const handleCopyHandoffPack = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(
        formatHandoffPackForClipboard(handoffPack),
      );
      onHandoffCopied();
      if (savedDraftId) {
        await saveCaseOutcome({
          draft_id: savedDraftId,
          status: "handoff-ready",
          outcome_summary: handoffPack.summary,
          handoff_pack_json: JSON.stringify(handoffPack),
          kb_draft_json: JSON.stringify(kbDraft),
          evidence_pack_json: JSON.stringify(evidencePack),
          tags_json: JSON.stringify(
            [caseIntake.likely_category].filter(Boolean),
          ),
        });
      }
      void logEvent("workspace_handoff_pack_copied", {
        ticket_id: currentTicketId,
        note_audience: caseIntake.note_audience,
      });
      onShowSuccess("Handoff pack copied");
    } catch {
      onShowError("Failed to copy handoff pack");
    }
  }, [
    handoffPack,
    savedDraftId,
    saveCaseOutcome,
    kbDraft,
    evidencePack,
    caseIntake.likely_category,
    caseIntake.note_audience,
    logEvent,
    currentTicketId,
    onHandoffCopied,
    onShowSuccess,
    onShowError,
  ]);

  const handleCopyEvidencePack = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(
        formatEvidencePackForClipboard(evidencePack),
      );
      if (savedDraftId) {
        await saveCaseOutcome({
          draft_id: savedDraftId,
          status: "evidence-ready",
          outcome_summary: evidencePack.summary,
          handoff_pack_json: JSON.stringify(handoffPack),
          kb_draft_json: JSON.stringify(kbDraft),
          evidence_pack_json: JSON.stringify(evidencePack),
          tags_json: JSON.stringify(kbDraft.tags),
        });
      }
      void logEvent("workspace_evidence_pack_copied", {
        ticket_id: currentTicketId,
      });
      onShowSuccess("Evidence pack copied");
    } catch {
      onShowError("Failed to copy evidence pack");
    }
  }, [
    evidencePack,
    savedDraftId,
    saveCaseOutcome,
    handoffPack,
    kbDraft,
    logEvent,
    currentTicketId,
    onShowSuccess,
    onShowError,
  ]);

  const handleCopyKbDraft = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(formatKbDraftForClipboard(kbDraft));
      if (savedDraftId) {
        await saveCaseOutcome({
          draft_id: savedDraftId,
          status: "kb-promoted",
          outcome_summary: kbDraft.summary,
          handoff_pack_json: JSON.stringify(handoffPack),
          kb_draft_json: JSON.stringify(kbDraft),
          evidence_pack_json: JSON.stringify(evidencePack),
          tags_json: JSON.stringify(kbDraft.tags),
        });
      }
      void logEvent("workspace_kb_draft_copied", {
        ticket_id: currentTicketId,
        category: caseIntake.likely_category,
      });
      onShowSuccess("KB draft copied");
    } catch {
      onShowError("Failed to copy KB draft");
    }
  }, [
    kbDraft,
    saveCaseOutcome,
    savedDraftId,
    handoffPack,
    evidencePack,
    logEvent,
    currentTicketId,
    caseIntake.likely_category,
    onShowSuccess,
    onShowError,
  ]);

  return {
    handleCopyHandoffPack,
    handleCopyEvidencePack,
    handleCopyKbDraft,
  };
}
