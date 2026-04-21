import { useEffect } from "react";
import type { SavedDraft } from "../../types/workspace";

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName.toLowerCase();
  return (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    target.isContentEditable
  );
}

type PanelDensityMode = "balanced" | "focus-intake" | "focus-response";
type ViewMode = "panels" | "conversation";

interface UseDraftLifecycleOptions {
  initialDraft?: SavedDraft | null;
  viewMode: ViewMode;
  input: string;
  savedDraftId: string | null;

  refreshWorkspaceCatalog: () => Promise<unknown>;
  findSimilar: (query: string) => Promise<unknown> | void;
  loadAlternatives: (draftId: string) => Promise<unknown> | void;
  loadTemplates: () => Promise<unknown> | void;
  handleLoadDraft: (draft: SavedDraft) => void;
  onPanelDensityModeChange: (mode: PanelDensityMode) => void;
  setSuggestionsDismissed: (value: boolean) => void;
}

export function useDraftLifecycle({
  initialDraft,
  viewMode,
  input,
  savedDraftId,
  refreshWorkspaceCatalog,
  findSimilar,
  loadAlternatives,
  loadTemplates,
  handleLoadDraft,
  onPanelDensityModeChange,
  setSuggestionsDismissed,
}: UseDraftLifecycleOptions) {
  useEffect(() => {
    void refreshWorkspaceCatalog();
  }, [refreshWorkspaceCatalog]);

  useEffect(() => {
    if (input.trim().length >= 10) {
      setSuggestionsDismissed(false);
      void findSimilar(input);
    }
  }, [input, findSimilar, setSuggestionsDismissed]);

  useEffect(() => {
    if (savedDraftId) {
      void loadAlternatives(savedDraftId);
    }
  }, [savedDraftId, loadAlternatives]);

  useEffect(() => {
    if (viewMode !== "panels") {
      return;
    }
    const handleKeydown = (event: KeyboardEvent) => {
      if (!event.metaKey || event.altKey || event.ctrlKey) {
        return;
      }
      if (isEditableTarget(event.target)) {
        return;
      }

      if (event.key === "1") {
        event.preventDefault();
        onPanelDensityModeChange("balanced");
      } else if (event.key === "2") {
        event.preventDefault();
        onPanelDensityModeChange("focus-intake");
      } else if (event.key === "3") {
        event.preventDefault();
        onPanelDensityModeChange("focus-response");
      }
    };

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [viewMode, onPanelDensityModeChange]);

  useEffect(() => {
    if (initialDraft) {
      handleLoadDraft(initialDraft);
    }
  }, [initialDraft, handleLoadDraft]);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);
}
