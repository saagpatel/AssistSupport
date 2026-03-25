import { useCallback, useState } from 'react';
import { toGuidedRunbookSession, toGuidedRunbookTemplate, toResolutionKit, toWorkspaceFavorite } from './workspaceAssistant';
import { resolveVisibleRunbookScopeKey } from './workspaceDraftSession';
import type { GuidedRunbookSession, GuidedRunbookTemplate, ResolutionKit, WorkspaceFavorite } from '../../types/workspace';
import type { WorkspaceOpsClient } from '../../hooks/useWorkspaceOps';

interface UseWorkspaceCatalogParams {
  workspaceRailEnabled: boolean;
  guidedRunbooksEnabled: boolean;
  workspaceRunbookScopeKey: string;
  defaultRunbookTemplates: Array<Omit<GuidedRunbookTemplate, 'id'>>;
  ops: Pick<
    WorkspaceOpsClient,
    | 'listResolutionKits'
    | 'listWorkspaceFavorites'
    | 'listRunbookTemplates'
    | 'saveRunbookTemplate'
    | 'listRunbookSessions'
    | 'listRunbookStepEvidence'
  >;
}

export interface WorkspaceCatalogState {
  resolutionKits: ResolutionKit[];
  workspaceFavorites: WorkspaceFavorite[];
  runbookTemplates: GuidedRunbookTemplate[];
  guidedRunbookSession: GuidedRunbookSession | null;
  setGuidedRunbookSession: (value: GuidedRunbookSession | null) => void;
  workspaceCatalogLoading: boolean;
  runbookSessionSourceScopeKey: string | null;
  runbookSessionTouched: boolean;
  setRunbookSessionSourceScopeKey: (value: string | null) => void;
  setRunbookSessionTouched: (value: boolean) => void;
  refreshWorkspaceCatalog: () => Promise<void>;
}

export function useWorkspaceCatalog({
  workspaceRailEnabled,
  guidedRunbooksEnabled,
  workspaceRunbookScopeKey,
  defaultRunbookTemplates,
  ops,
}: UseWorkspaceCatalogParams): WorkspaceCatalogState {
  const [resolutionKits, setResolutionKits] = useState<ResolutionKit[]>([]);
  const [workspaceFavorites, setWorkspaceFavorites] = useState<WorkspaceFavorite[]>([]);
  const [runbookTemplates, setRunbookTemplates] = useState<GuidedRunbookTemplate[]>([]);
  const [guidedRunbookSession, setGuidedRunbookSession] = useState<GuidedRunbookSession | null>(null);
  const [workspaceCatalogLoading, setWorkspaceCatalogLoading] = useState(false);
  const [runbookSessionSourceScopeKey, setRunbookSessionSourceScopeKey] = useState<string | null>(null);
  const [runbookSessionTouched, setRunbookSessionTouched] = useState(false);

  const refreshWorkspaceCatalog = useCallback(async () => {
    if (!workspaceRailEnabled) {
      setResolutionKits([]);
      setWorkspaceFavorites([]);
      setRunbookTemplates([]);
      setGuidedRunbookSession(null);
      return;
    }

    setWorkspaceCatalogLoading(true);
    try {
      const [kitRecords, favoriteRecords, templateRecords, sessionRecords] = await Promise.all([
        ops.listResolutionKits(20).catch(() => []),
        ops.listWorkspaceFavorites().catch(() => []),
        ops.listRunbookTemplates(20).catch(() => []),
        ops.listRunbookSessions(20, undefined, workspaceRunbookScopeKey).catch(() => []),
      ]);

      let nextTemplateRecords = templateRecords;
      if (guidedRunbooksEnabled && nextTemplateRecords.length === 0) {
        await Promise.all(
          defaultRunbookTemplates.map((template) =>
            ops.saveRunbookTemplate({
              name: template.name,
              scenario: template.scenario,
              steps_json: JSON.stringify(template.steps),
            }),
          ),
        ).catch(() => undefined);
        nextTemplateRecords = await ops.listRunbookTemplates(20).catch(() => []);
      }

      setResolutionKits(kitRecords.map(toResolutionKit));
      setWorkspaceFavorites(favoriteRecords.map(toWorkspaceFavorite));
      setRunbookTemplates(nextTemplateRecords.map(toGuidedRunbookTemplate));

      const legacySessionRecords = sessionRecords.length === 0
        ? await ops.listRunbookSessions(20, undefined, 'legacy:unscoped').catch(() => [])
        : [];
      const visibleSessionRecords = sessionRecords.length > 0 ? sessionRecords : legacySessionRecords;
      const nextVisibleRunbookScopeKey = resolveVisibleRunbookScopeKey(
        workspaceRunbookScopeKey,
        sessionRecords.length > 0,
        legacySessionRecords.length > 0,
      );

      const activeSessionRecord = visibleSessionRecords.find((session) => session.status === 'active' || session.status === 'paused')
        ?? visibleSessionRecords[0]
        ?? null;

      if (!activeSessionRecord) {
        setGuidedRunbookSession(null);
        setRunbookSessionSourceScopeKey(null);
        setRunbookSessionTouched(false);
        return;
      }

      const evidenceRecords = await ops.listRunbookStepEvidence(activeSessionRecord.id).catch(() => []);
      if (guidedRunbookSession?.id !== activeSessionRecord.id) {
        setRunbookSessionTouched(false);
      }
      setGuidedRunbookSession(toGuidedRunbookSession(activeSessionRecord, evidenceRecords));
      setRunbookSessionSourceScopeKey(nextVisibleRunbookScopeKey);
    } finally {
      setWorkspaceCatalogLoading(false);
    }
  }, [
    defaultRunbookTemplates,
    guidedRunbookSession?.id,
    guidedRunbooksEnabled,
    ops,
    workspaceRailEnabled,
    workspaceRunbookScopeKey,
  ]);

  return {
    resolutionKits,
    workspaceFavorites,
    runbookTemplates,
    guidedRunbookSession,
    setGuidedRunbookSession,
    workspaceCatalogLoading,
    runbookSessionSourceScopeKey,
    runbookSessionTouched,
    setRunbookSessionSourceScopeKey,
    setRunbookSessionTouched,
    refreshWorkspaceCatalog,
  };
}
