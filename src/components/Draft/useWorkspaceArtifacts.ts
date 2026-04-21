import { useCallback, useEffect, useState } from "react";
import {
  applyResolutionKit,
  buildResolutionKitFromWorkspace,
  buildSimilarCases,
  compactLines,
} from "../../features/workspace/workspaceAssistant";
import type { JiraTicket } from "../../hooks/useJira";
import type { ContextSource } from "../../types/knowledge";
import type {
  CaseIntake,
  KbDraft,
  ResolutionKit,
  SavedDraft,
  SimilarCase,
  WorkspaceFavorite,
} from "../../types/workspace";

type PanelDensityMode = "balanced" | "focus-intake" | "focus-response";

interface UseWorkspaceArtifactsOptions {
  similarCasesEnabled: boolean;
  input: string;
  response: string;
  currentTicket: JiraTicket | null;
  currentTicketId: string | null;
  caseIntake: CaseIntake;
  kbDraft: KbDraft;
  sources: ContextSource[];
  savedDraftId: string | null;
  workspaceFavorites: WorkspaceFavorite[];

  searchDrafts: (query: string, limit: number) => Promise<SavedDraft[]>;
  saveResolutionKit: (
    kit: Omit<ResolutionKit, "id"> & { id?: string },
  ) => Promise<string>;
  saveWorkspaceFavorite: (
    favorite: Omit<WorkspaceFavorite, "id"> & { id?: string },
  ) => Promise<string>;
  deleteWorkspaceFavorite: (id: string) => Promise<void>;
  refreshWorkspaceCatalog: () => Promise<unknown>;
  logEvent: (event: string, payload?: Record<string, unknown>) => unknown;

  setResponse: (value: string) => void;
  setOriginalResponse: (value: string) => void;
  setIsResponseEdited: (value: boolean) => void;
  setCaseIntake: (value: CaseIntake) => void;
  setDiagnosticNotes: (updater: (prev: string) => string) => void;
  setPanelDensityMode: (mode: PanelDensityMode) => void;

  onShowSuccess: (message: string) => void;
  onShowError: (message: string) => void;
}

export function useWorkspaceArtifacts({
  similarCasesEnabled,
  input,
  response,
  currentTicket,
  currentTicketId,
  caseIntake,
  kbDraft,
  sources,
  savedDraftId,
  workspaceFavorites,
  searchDrafts,
  saveResolutionKit,
  saveWorkspaceFavorite,
  deleteWorkspaceFavorite,
  refreshWorkspaceCatalog,
  logEvent,
  setResponse,
  setOriginalResponse,
  setIsResponseEdited,
  setCaseIntake,
  setDiagnosticNotes,
  setPanelDensityMode,
  onShowSuccess,
  onShowError,
}: UseWorkspaceArtifactsOptions) {
  const [similarCases, setSimilarCases] = useState<SimilarCase[]>([]);
  const [similarCasesLoading, setSimilarCasesLoading] = useState(false);
  const [compareCase, setCompareCase] = useState<SimilarCase | null>(null);

  const handleRefreshSimilarCases = useCallback(async () => {
    if (!similarCasesEnabled) {
      setSimilarCases([]);
      return;
    }

    const query = [
      input,
      currentTicket?.summary,
      caseIntake.issue,
      caseIntake.symptoms,
    ]
      .filter((value): value is string => Boolean(value?.trim()))
      .join(" ");

    if (!query.trim()) {
      setSimilarCases([]);
      return;
    }

    setSimilarCasesLoading(true);
    try {
      const results = await searchDrafts(query, 20);
      const next = buildSimilarCases({
        currentDraftId: savedDraftId,
        queryText: query,
        drafts: results,
      });
      setSimilarCases(next);
    } finally {
      setSimilarCasesLoading(false);
    }
  }, [
    similarCasesEnabled,
    input,
    currentTicket?.summary,
    caseIntake.issue,
    caseIntake.symptoms,
    searchDrafts,
    savedDraftId,
  ]);

  useEffect(() => {
    if (!similarCasesEnabled) {
      return;
    }

    const query = [
      input,
      caseIntake.issue,
      caseIntake.symptoms,
      currentTicket?.summary,
    ]
      .filter((value): value is string => Boolean(value?.trim()))
      .join(" ");
    if (!query.trim()) {
      setSimilarCases([]);
      return;
    }

    const timer = window.setTimeout(() => {
      void handleRefreshSimilarCases();
    }, 350);

    return () => window.clearTimeout(timer);
  }, [
    similarCasesEnabled,
    input,
    caseIntake.issue,
    caseIntake.symptoms,
    currentTicket?.summary,
    handleRefreshSimilarCases,
  ]);

  const handleCompareLastResolution = useCallback(() => {
    if (!response.trim()) {
      onShowError(
        "Generate or paste a response before comparing it to a prior resolution",
      );
      return;
    }

    const bestMatch = similarCases[0];
    if (!bestMatch || !bestMatch.response_text.trim()) {
      onShowError("No similar solved case is ready to compare yet");
      return;
    }

    setCompareCase(bestMatch);
    void logEvent("workspace_compare_last_resolution_opened", {
      ticket_id: currentTicketId,
      similar_case_id: bestMatch.draft_id,
    });
  }, [response, similarCases, onShowError, logEvent, currentTicketId]);

  const handleCompareSimilarCase = useCallback(
    (similarCase: SimilarCase) => {
      if (!response.trim()) {
        onShowError(
          "Generate or paste a response before comparing it to a prior resolution",
        );
        return;
      }
      setCompareCase(similarCase);
    },
    [response, onShowError],
  );

  const handleSaveCurrentResolutionKit = useCallback(async () => {
    try {
      const nextKit = buildResolutionKitFromWorkspace({
        intake: caseIntake,
        kbDraft,
        responseText: response,
        sources,
      });
      await saveResolutionKit({
        ...nextKit,
        response_template: nextKit.response_template,
        checklist_items: nextKit.checklist_items,
        kb_document_ids: nextKit.kb_document_ids,
      });
      await refreshWorkspaceCatalog();
      void logEvent("workspace_resolution_kit_saved", {
        ticket_id: currentTicketId,
        category: nextKit.category,
      });
      onShowSuccess("Saved the current workspace as a resolution kit");
    } catch {
      onShowError("Failed to save resolution kit");
    }
  }, [
    caseIntake,
    kbDraft,
    response,
    sources,
    saveResolutionKit,
    refreshWorkspaceCatalog,
    logEvent,
    currentTicketId,
    onShowSuccess,
    onShowError,
  ]);

  const handleApplyResolutionKit = useCallback(
    (kit: ResolutionKit) => {
      const applied = applyResolutionKit({
        currentInput: input,
        currentResponse: response,
        currentIntake: caseIntake,
        kit,
      });
      setResponse(applied.responseText);
      if (!response.trim() && applied.responseText) {
        setOriginalResponse(applied.responseText);
        setIsResponseEdited(false);
      }
      setCaseIntake(applied.intake);
      setDiagnosticNotes((prev) => compactLines([prev, applied.checklistText]));
      setPanelDensityMode("focus-intake");
      void logEvent("workspace_resolution_kit_applied", {
        ticket_id: currentTicketId,
        kit_id: kit.id,
        category: kit.category,
      });
      onShowSuccess(`Applied ${kit.name}`);
    },
    [
      input,
      response,
      caseIntake,
      logEvent,
      currentTicketId,
      onShowSuccess,
      setResponse,
      setOriginalResponse,
      setIsResponseEdited,
      setCaseIntake,
      setDiagnosticNotes,
      setPanelDensityMode,
    ],
  );

  const handleToggleWorkspaceFavorite = useCallback(
    async (
      kind: WorkspaceFavorite["kind"],
      resourceId: string,
      label: string,
      metadata?: Record<string, string> | null,
    ) => {
      try {
        const existing = workspaceFavorites.find(
          (favorite) =>
            favorite.kind === kind && favorite.resource_id === resourceId,
        );
        if (existing) {
          await deleteWorkspaceFavorite(existing.id);
          onShowSuccess(`Removed ${label} from favorites`);
        } else {
          await saveWorkspaceFavorite({
            kind,
            label,
            resource_id: resourceId,
            metadata: metadata ?? null,
          });
          onShowSuccess(`Added ${label} to favorites`);
        }
        await refreshWorkspaceCatalog();
        void logEvent("workspace_favorite_toggled", {
          ticket_id: currentTicketId,
          kind,
          resource_id: resourceId,
        });
      } catch {
        onShowError("Failed to update favorites");
      }
    },
    [
      workspaceFavorites,
      deleteWorkspaceFavorite,
      saveWorkspaceFavorite,
      refreshWorkspaceCatalog,
      logEvent,
      currentTicketId,
      onShowSuccess,
      onShowError,
    ],
  );

  const resetWorkspaceArtifacts = useCallback(() => {
    setSimilarCases([]);
    setSimilarCasesLoading(false);
    setCompareCase(null);
  }, []);

  return {
    similarCases,
    setSimilarCases,
    similarCasesLoading,
    setSimilarCasesLoading,
    compareCase,
    setCompareCase,
    handleRefreshSimilarCases,
    handleCompareLastResolution,
    handleCompareSimilarCase,
    handleSaveCurrentResolutionKit,
    handleApplyResolutionKit,
    handleToggleWorkspaceFavorite,
    resetWorkspaceArtifacts,
  };
}
