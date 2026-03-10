import type { CaseIntake } from '../../types';

export interface MeaningfulWorkspaceDraftArgs {
  inputText: string;
  responseText?: string | null;
  diagnosisJson?: string | null;
  caseIntake?: CaseIntake | null;
  handoffTouched?: boolean;
  hasGuidedRunbookState?: boolean;
}

export interface WorkspaceAutosaveStateArgs {
  hasMeaningfulContent: boolean;
  savedDraftId: string | null;
  autosaveDraftId: string | null;
  createDraftId: () => string;
}

export interface WorkspaceAutosaveState {
  stateAutosaveDraftId: string | null;
  autosaveRecordId: string | null;
}

export interface LoadedWorkspaceDraftState {
  savedDraftId: string | null;
  autosaveDraftId: string | null;
  workspaceRunbookScopeKey: string;
}

export interface VisibleRunbookMigrationArgs {
  hasGuidedRunbookSession: boolean;
  runbookSessionTouched: boolean;
  runbookSessionSourceScopeKey: string | null;
  workspaceRunbookScopeKey: string;
}

export function parseGuidedRunbookDraftNote(
  diagnosisJson: string | null | undefined,
): string {
  if (!diagnosisJson?.trim()) {
    return '';
  }

  try {
    const parsed = JSON.parse(diagnosisJson) as { guidedRunbookDraftNote?: unknown };
    return typeof parsed.guidedRunbookDraftNote === 'string'
      ? parsed.guidedRunbookDraftNote
      : '';
  } catch {
    return '';
  }
}

export function hasMeaningfulWorkspaceDraftContent({
  inputText,
  responseText,
  diagnosisJson,
  caseIntake,
  handoffTouched,
  hasGuidedRunbookState,
}: MeaningfulWorkspaceDraftArgs): boolean {
  const hasStructuredIntake = Boolean(
    caseIntake?.issue?.trim()
    || caseIntake?.environment?.trim()
    || caseIntake?.impact?.trim()
    || caseIntake?.affected_user?.trim()
    || caseIntake?.affected_system?.trim()
    || caseIntake?.affected_site?.trim()
    || caseIntake?.symptoms?.trim()
    || caseIntake?.steps_tried?.trim()
    || caseIntake?.blockers?.trim()
    || caseIntake?.likely_category?.trim()
    || caseIntake?.user?.trim()
    || caseIntake?.device?.trim()
    || caseIntake?.os?.trim()
    || caseIntake?.reproduction?.trim()
    || caseIntake?.logs?.trim()
    || (caseIntake?.custom_fields && Object.keys(caseIntake.custom_fields).length > 0)
  );

  return Boolean(
    inputText.trim()
    || responseText?.trim()
    || diagnosisJson?.trim()
    || hasStructuredIntake
    || handoffTouched
    || hasGuidedRunbookState,
  );
}

export function resolveWorkspaceAutosaveState({
  hasMeaningfulContent,
  savedDraftId,
  autosaveDraftId,
  createDraftId,
}: WorkspaceAutosaveStateArgs): WorkspaceAutosaveState {
  if (!hasMeaningfulContent) {
    return {
      stateAutosaveDraftId: autosaveDraftId,
      autosaveRecordId: null,
    };
  }

  if (savedDraftId) {
    const stableAutosaveId = autosaveDraftId ?? createDraftId();
    return {
      stateAutosaveDraftId: stableAutosaveId,
      autosaveRecordId: stableAutosaveId,
    };
  }

  const stableAutosaveId = autosaveDraftId ?? createDraftId();
  return {
    stateAutosaveDraftId: stableAutosaveId,
    autosaveRecordId: stableAutosaveId,
  };
}

export function shouldProceedAfterSaveAttempt(
  mode: 'replace' | 'save-and-open' | 'compare',
  savedDraftId: string | null,
): boolean {
  return mode !== 'save-and-open' || Boolean(savedDraftId);
}

export function resolveLoadedWorkspaceDraftState(
  draftId: string,
  isAutosave: boolean,
): LoadedWorkspaceDraftState {
  return {
    savedDraftId: isAutosave ? null : draftId,
    autosaveDraftId: isAutosave ? draftId : null,
    workspaceRunbookScopeKey: `draft:${draftId}`,
  };
}

export function resolveVisibleRunbookScopeKey(
  currentScopeKey: string,
  hasPrimaryScopedSessions: boolean,
  hasLegacySessions: boolean,
): string {
  if (hasPrimaryScopedSessions || !hasLegacySessions) {
    return currentScopeKey;
  }
  return 'legacy:unscoped';
}

export function shouldTreatGuidedRunbookAsWorkspaceProgress({
  hasGuidedRunbookSession,
  runbookSessionTouched,
  runbookSessionSourceScopeKey,
  workspaceRunbookScopeKey,
}: VisibleRunbookMigrationArgs): boolean {
  return Boolean(
    runbookSessionTouched
    || (hasGuidedRunbookSession && runbookSessionSourceScopeKey === workspaceRunbookScopeKey),
  );
}

export function shouldMigrateVisibleRunbookSession(
  args: VisibleRunbookMigrationArgs,
): boolean {
  return shouldTreatGuidedRunbookAsWorkspaceProgress(args);
}
