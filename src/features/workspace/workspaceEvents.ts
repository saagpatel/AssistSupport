export const WORKSPACE_ANALYZE_INTAKE_EVENT = 'assistsupport:workspace:analyze-intake';
export const WORKSPACE_COPY_HANDOFF_EVENT = 'assistsupport:workspace:copy-handoff';
export const WORKSPACE_COPY_EVIDENCE_EVENT = 'assistsupport:workspace:copy-evidence';
export const WORKSPACE_COPY_KB_DRAFT_EVENT = 'assistsupport:workspace:copy-kb-draft';
export const WORKSPACE_REFRESH_SIMILAR_CASES_EVENT = 'assistsupport:workspace:refresh-similar-cases';
export const WORKSPACE_COMPARE_LAST_RESOLUTION_EVENT = 'assistsupport:workspace:compare-last-resolution';

export function dispatchWorkspaceEvent(eventName: string) {
  if (typeof window === 'undefined') {
    return;
  }
  window.dispatchEvent(new CustomEvent(eventName));
}
