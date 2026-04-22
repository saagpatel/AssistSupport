import { useState, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import type {
  GenerateWithContextParams,
  GenerateWithContextResult,
  StreamToken,
  TreeDecisions,
  JiraTicketContext,
} from "../types/llm";
import type { ResponseLength } from "../types/workspace";

// Maximum streaming text buffer size (500KB) to prevent memory spikes
const MAX_STREAMING_TEXT_SIZE = 500 * 1024;

export interface LlmStreamingState {
  streamingText: string;
  isStreaming: boolean;
  generating: boolean;
  error: string | null;
}

const DEFAULT_STATE: LlmStreamingState = {
  streamingText: "",
  isStreaming: false,
  generating: false,
  error: null,
};

interface StreamingOptions {
  onToken?: (token: string) => void;
  treeDecisions?: TreeDecisions;
  diagnosticNotes?: string;
  jiraTicket?: JiraTicketContext;
}

/**
 * Hook for token-streaming generation and cancellation. Owns its own
 * streamingText/isStreaming/generating slice so consumers that only care
 * about streaming don't pay for re-renders driven by other generation
 * surfaces. Bounded streaming buffer: text is truncated with a "…[truncated]…"
 * prefix once it exceeds MAX_STREAMING_TEXT_SIZE (500KB).
 */
export function useLlmStreaming() {
  const [state, setState] = useState<LlmStreamingState>(DEFAULT_STATE);
  const unlistenRef = useRef<UnlistenFn | null>(null);

  const generateStreaming = useCallback(
    async (
      query: string,
      responseLength: ResponseLength = "Medium",
      options?: StreamingOptions,
    ): Promise<GenerateWithContextResult> => {
      // Clean up any previous listener
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }

      setState((prev) => ({
        ...prev,
        generating: true,
        isStreaming: true,
        streamingText: "",
        error: null,
      }));

      // Set up token listener with size limit to prevent memory spikes
      const unlisten = await listen<StreamToken>("llm-token", (event) => {
        if (event.payload.done) {
          setState((prev) => ({ ...prev, isStreaming: false }));
        } else {
          setState((prev) => {
            const newText = prev.streamingText + event.payload.token;
            if (newText.length > MAX_STREAMING_TEXT_SIZE) {
              const truncated = newText.slice(
                newText.length - MAX_STREAMING_TEXT_SIZE,
              );
              return {
                ...prev,
                streamingText: "...[truncated]..." + truncated,
              };
            }
            return { ...prev, streamingText: newText };
          });
          options?.onToken?.(event.payload.token);
        }
      });
      unlistenRef.current = unlisten;

      try {
        const params: GenerateWithContextParams = {
          user_input: query,
          response_length: responseLength,
          diagnostic_notes: options?.diagnosticNotes,
          tree_decisions: options?.treeDecisions,
          jira_ticket: options?.jiraTicket,
        };
        const result = await invoke<GenerateWithContextResult>(
          "generate_streaming",
          { params },
        );
        setState((prev) => ({
          ...prev,
          generating: false,
          isStreaming: false,
        }));
        return result;
      } catch (e) {
        setState((prev) => ({
          ...prev,
          generating: false,
          isStreaming: false,
          error: String(e),
        }));
        throw e;
      } finally {
        if (unlistenRef.current) {
          unlistenRef.current();
          unlistenRef.current = null;
        }
      }
    },
    [],
  );

  const clearStreamingText = useCallback(() => {
    setState((prev) => ({ ...prev, streamingText: "" }));
  }, []);

  const cancelGeneration = useCallback(async () => {
    try {
      await invoke("cancel_generation");
      setState((prev) => ({
        ...prev,
        generating: false,
        isStreaming: false,
      }));
    } catch (e) {
      console.error("Failed to cancel generation:", e);
    }
  }, []);

  return {
    ...state,
    generateStreaming,
    clearStreamingText,
    cancelGeneration,
  };
}
