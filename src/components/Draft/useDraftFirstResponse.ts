import { useCallback, useState } from "react";
import type { JiraTicket } from "../../hooks/useJira";
import type { FirstResponseTone } from "../../types/llm";

interface UseDraftFirstResponseOptions {
  input: string;
  ocrText: string | null;
  currentTicket: JiraTicket | null;
  modelLoaded: boolean;
  generateFirstResponse: (params: {
    user_input: string;
    tone: FirstResponseTone;
    ocr_text?: string;
    jira_ticket?: JiraTicket;
  }) => Promise<{ text: string }>;
  onShowSuccess: (message: string) => void;
  onShowError: (message: string) => void;
}

export function useDraftFirstResponse({
  input,
  ocrText,
  currentTicket,
  modelLoaded,
  generateFirstResponse,
  onShowSuccess,
  onShowError,
}: UseDraftFirstResponseOptions) {
  const [firstResponse, setFirstResponse] = useState("");
  const [firstResponseTone, setFirstResponseTone] =
    useState<FirstResponseTone>("slack");
  const [firstResponseGenerating, setFirstResponseGenerating] = useState(false);

  const handleGenerateFirstResponse = useCallback(async () => {
    if (firstResponseGenerating) return;

    if (!modelLoaded) {
      onShowError("No model loaded. Go to Settings to load a model.");
      return;
    }

    const ticketFallback = currentTicket
      ? `${currentTicket.summary}${currentTicket.description ? `\n\n${currentTicket.description}` : ""}`
      : "";
    const promptInput =
      input.trim() || ticketFallback.trim() || ocrText?.trim() || "";
    if (!promptInput) {
      onShowError(
        "Add ticket details or notes before generating a first response.",
      );
      return;
    }

    setFirstResponseGenerating(true);
    try {
      const result = await generateFirstResponse({
        user_input: promptInput,
        tone: firstResponseTone,
        ocr_text: ocrText ?? undefined,
        jira_ticket: currentTicket ?? undefined,
      });
      setFirstResponse(result.text);
    } catch (e) {
      console.error("First response generation failed:", e);
      onShowError(`First response failed: ${e}`);
    } finally {
      setFirstResponseGenerating(false);
    }
  }, [
    input,
    firstResponseGenerating,
    modelLoaded,
    generateFirstResponse,
    firstResponseTone,
    ocrText,
    currentTicket,
    onShowError,
  ]);

  const handleCopyFirstResponse = useCallback(async () => {
    if (!firstResponse.trim()) return;
    try {
      await navigator.clipboard.writeText(firstResponse);
      onShowSuccess("First response copied to clipboard");
    } catch {
      onShowError("Failed to copy first response");
    }
  }, [firstResponse, onShowSuccess, onShowError]);

  const handleClearFirstResponse = useCallback(() => {
    setFirstResponse("");
  }, []);

  const resetFirstResponse = useCallback(() => {
    setFirstResponse("");
    setFirstResponseTone("slack");
    setFirstResponseGenerating(false);
  }, []);

  return {
    firstResponse,
    setFirstResponse,
    firstResponseTone,
    setFirstResponseTone,
    firstResponseGenerating,
    handleGenerateFirstResponse,
    handleCopyFirstResponse,
    handleClearFirstResponse,
    resetFirstResponse,
  };
}
