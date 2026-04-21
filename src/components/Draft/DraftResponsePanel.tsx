import { AlternativePanel } from "./AlternativePanel";
import { ResponsePanel } from "./ResponsePanel";
import { SavedResponsesSuggestion } from "./SavedResponsesSuggestion";
import type { ContextSource } from "../../types/knowledge";
import type {
  ConfidenceAssessment,
  GenerationMetrics,
  GroundedClaim,
} from "../../types/llm";
import type {
  ResponseAlternative,
  SavedResponseTemplate,
} from "../../types/workspace";

interface DraftResponsePanelProps {
  suggestions: SavedResponseTemplate[];
  suggestionsDismissed: boolean;
  onSuggestionApply: (content: string, templateId: string) => void;
  onSuggestionDismiss: () => void;

  response: string;
  streamingText: string;
  isStreaming: boolean;
  sources: ContextSource[];
  generating: boolean;
  metrics: GenerationMetrics | null;
  confidence: ConfidenceAssessment | null;
  grounding: GroundedClaim[];
  savedDraftId: string | null;
  hasInput: boolean;
  isResponseEdited: boolean;
  loadedModelName: string | null;
  currentTicketId: string | null;
  onSaveDraft: () => void;
  onCancel: () => void;
  onResponseChange: (text: string) => void;
  onGenerateAlternative: () => void;
  generatingAlternative: boolean;
  onSaveAsTemplate: (rating: number) => void;

  alternatives: ResponseAlternative[];
  onChooseAlternative: (
    alternativeId: string,
    choice: "original" | "alternative",
  ) => void;
  onUseAlternative: (text: string) => void;
}

export function DraftResponsePanel({
  suggestions,
  suggestionsDismissed,
  onSuggestionApply,
  onSuggestionDismiss,
  response,
  streamingText,
  isStreaming,
  sources,
  generating,
  metrics,
  confidence,
  grounding,
  savedDraftId,
  hasInput,
  isResponseEdited,
  loadedModelName,
  currentTicketId,
  onSaveDraft,
  onCancel,
  onResponseChange,
  onGenerateAlternative,
  generatingAlternative,
  onSaveAsTemplate,
  alternatives,
  onChooseAlternative,
  onUseAlternative,
}: DraftResponsePanelProps) {
  const showSuggestions =
    !suggestionsDismissed && suggestions.length > 0 && !response;
  const showAlternatives =
    alternatives.length > 0 && response && !generating && !isStreaming;

  return (
    <>
      {showSuggestions ? (
        <SavedResponsesSuggestion
          suggestions={suggestions}
          onApply={onSuggestionApply}
          onDismiss={onSuggestionDismiss}
        />
      ) : null}
      <ResponsePanel
        response={response}
        streamingText={streamingText}
        isStreaming={isStreaming}
        sources={sources}
        generating={generating}
        metrics={metrics}
        confidence={confidence}
        grounding={grounding}
        draftId={savedDraftId}
        onSaveDraft={onSaveDraft}
        onCancel={onCancel}
        hasInput={hasInput}
        onResponseChange={onResponseChange}
        isEdited={isResponseEdited}
        modelName={loadedModelName}
        onGenerateAlternative={onGenerateAlternative}
        generatingAlternative={generatingAlternative}
        ticketKey={currentTicketId}
        onSaveAsTemplate={onSaveAsTemplate}
      />
      {showAlternatives ? (
        <AlternativePanel
          alternatives={alternatives}
          onChoose={onChooseAlternative}
          onUseAlternative={onUseAlternative}
        />
      ) : null}
    </>
  );
}
