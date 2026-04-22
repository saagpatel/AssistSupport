import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { ConversationEntry } from "./ConversationThread";
import type {
  ConfidenceAssessment,
  GenerateWithContextResult,
  GroundedClaim,
  JiraTicketContext,
  TreeDecisions,
} from "../../types/llm";
import type { ContextSource } from "../../types/knowledge";
import type { ResponseLength } from "../../types/workspace";

export type GenerateStreamingFn = (
  query: string,
  responseLength?: ResponseLength,
  options?: {
    onToken?: (token: string) => void;
    treeDecisions?: TreeDecisions;
    diagnosticNotes?: string;
    jiraTicket?: JiraTicketContext;
  },
) => Promise<GenerateWithContextResult>;

export interface UseConversationSubmitOptions {
  modelLoaded: boolean;
  responseLength: ResponseLength;
  generateStreaming: GenerateStreamingFn;
  clearStreamingText: () => void;
  setConversationEntries: Dispatch<SetStateAction<ConversationEntry[]>>;
  setInput: Dispatch<SetStateAction<string>>;
  setGenerating: (value: boolean) => void;
  setResponse: Dispatch<SetStateAction<string>>;
  setOriginalResponse: Dispatch<SetStateAction<string>>;
  setIsResponseEdited: Dispatch<SetStateAction<boolean>>;
  setSources: Dispatch<SetStateAction<ContextSource[]>>;
  setConfidence: Dispatch<SetStateAction<ConfidenceAssessment | null>>;
  setGrounding: Dispatch<SetStateAction<GroundedClaim[]>>;
}

/**
 * Handles submission of a conversation-mode message: appends the input entry
 * to the transcript, streams a generation, then appends the response entry
 * with its metrics. Extracted from DraftTab so the 50-line handler lives
 * alongside the other Draft hooks.
 */
export function useConversationSubmit({
  modelLoaded,
  responseLength,
  generateStreaming,
  clearStreamingText,
  setConversationEntries,
  setInput,
  setGenerating,
  setResponse,
  setOriginalResponse,
  setIsResponseEdited,
  setSources,
  setConfidence,
  setGrounding,
}: UseConversationSubmitOptions) {
  return useCallback(
    async (text: string) => {
      if (!modelLoaded) return;

      const inputEntry: ConversationEntry = {
        id: crypto.randomUUID(),
        type: "input",
        timestamp: new Date().toISOString(),
        content: text,
      };
      setConversationEntries((prev) => [...prev, inputEntry]);
      setInput(text);

      setGenerating(true);
      setResponse("");
      clearStreamingText();
      setConfidence(null);
      setGrounding([]);
      try {
        const result = await generateStreaming(text, responseLength, {});
        setResponse(result.text);
        setOriginalResponse(result.text);
        setIsResponseEdited(false);
        setSources(result.sources);
        setConfidence(result.confidence ?? null);
        setGrounding(result.grounding ?? []);

        const responseEntry: ConversationEntry = {
          id: crypto.randomUUID(),
          type: "response",
          timestamp: new Date().toISOString(),
          content: result.text,
          sources: result.sources,
          metrics: result.metrics
            ? {
                tokens_per_second: result.metrics.tokens_per_second,
                sources_used: result.metrics.sources_used,
                word_count: result.metrics.word_count,
              }
            : undefined,
        };
        setConversationEntries((prev) => [...prev, responseEntry]);
      } catch (e) {
        console.error("Generation failed:", e);
      } finally {
        setGenerating(false);
      }
    },
    [
      modelLoaded,
      responseLength,
      generateStreaming,
      clearStreamingText,
      setConversationEntries,
      setInput,
      setGenerating,
      setResponse,
      setOriginalResponse,
      setIsResponseEdited,
      setSources,
      setConfidence,
      setGrounding,
    ],
  );
}
