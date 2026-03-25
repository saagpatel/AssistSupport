import { useEffect } from 'react';
import {
  WORKSPACE_ANALYZE_INTAKE_EVENT,
  WORKSPACE_COMPARE_LAST_RESOLUTION_EVENT,
  WORKSPACE_COPY_EVIDENCE_EVENT,
  WORKSPACE_COPY_HANDOFF_EVENT,
  WORKSPACE_COPY_KB_DRAFT_EVENT,
  WORKSPACE_REFRESH_SIMILAR_CASES_EVENT,
} from './workspaceEvents';

interface UseWorkspaceCommandBridgeParams {
  enabled: boolean;
  onAnalyzeIntake: () => void;
  onCopyHandoffPack: () => void | Promise<void>;
  onCopyEvidencePack: () => void | Promise<void>;
  onCopyKbDraft: () => void | Promise<void>;
  onRefreshSimilarCases: () => void | Promise<void>;
  onCompareLastResolution: () => void;
}

export function useWorkspaceCommandBridge({
  enabled,
  onAnalyzeIntake,
  onCopyHandoffPack,
  onCopyEvidencePack,
  onCopyKbDraft,
  onRefreshSimilarCases,
  onCompareLastResolution,
}: UseWorkspaceCommandBridgeParams) {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    const handleAnalyze = () => onAnalyzeIntake();
    const handleCopyHandoff = () => void onCopyHandoffPack();
    const handleCopyEvidence = () => void onCopyEvidencePack();
    const handleCopyKbDraftFromEvent = () => void onCopyKbDraft();
    const handleRefreshCases = () => void onRefreshSimilarCases();
    const handleCompareLast = () => onCompareLastResolution();

    window.addEventListener(WORKSPACE_ANALYZE_INTAKE_EVENT, handleAnalyze);
    window.addEventListener(WORKSPACE_COPY_HANDOFF_EVENT, handleCopyHandoff);
    window.addEventListener(WORKSPACE_COPY_EVIDENCE_EVENT, handleCopyEvidence);
    window.addEventListener(WORKSPACE_COPY_KB_DRAFT_EVENT, handleCopyKbDraftFromEvent);
    window.addEventListener(WORKSPACE_REFRESH_SIMILAR_CASES_EVENT, handleRefreshCases);
    window.addEventListener(WORKSPACE_COMPARE_LAST_RESOLUTION_EVENT, handleCompareLast);

    return () => {
      window.removeEventListener(WORKSPACE_ANALYZE_INTAKE_EVENT, handleAnalyze);
      window.removeEventListener(WORKSPACE_COPY_HANDOFF_EVENT, handleCopyHandoff);
      window.removeEventListener(WORKSPACE_COPY_EVIDENCE_EVENT, handleCopyEvidence);
      window.removeEventListener(WORKSPACE_COPY_KB_DRAFT_EVENT, handleCopyKbDraftFromEvent);
      window.removeEventListener(WORKSPACE_REFRESH_SIMILAR_CASES_EVENT, handleRefreshCases);
      window.removeEventListener(WORKSPACE_COMPARE_LAST_RESOLUTION_EVENT, handleCompareLast);
    };
  }, [
    enabled,
    onAnalyzeIntake,
    onCompareLastResolution,
    onCopyEvidencePack,
    onCopyHandoffPack,
    onCopyKbDraft,
    onRefreshSimilarCases,
  ]);
}
