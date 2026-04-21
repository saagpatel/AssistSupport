import { useCallback, useEffect, useState } from "react";
import type { ContextSource, SearchResult } from "../../types/knowledge";

interface UseDraftApprovalOptions {
  searchKb: (query: string, limit: number) => Promise<SearchResult[]>;
  generateWithContextParams: (params: {
    user_input: string;
    kb_limit: number;
    response_length: "Short" | "Medium" | "Long";
  }) => Promise<{ text: string; sources: ContextSource[] }>;
  modelLoaded: boolean;
  onShowError: (message: string) => void;
}

export function useDraftApproval({
  searchKb,
  generateWithContextParams,
  modelLoaded,
  onShowError,
}: UseDraftApprovalOptions) {
  const [approvalQuery, setApprovalQuery] = useState("");
  const [approvalResults, setApprovalResults] = useState<SearchResult[]>([]);
  const [approvalSearching, setApprovalSearching] = useState(false);
  const [approvalSummary, setApprovalSummary] = useState("");
  const [approvalSummarizing, setApprovalSummarizing] = useState(false);
  const [approvalSources, setApprovalSources] = useState<ContextSource[]>([]);
  const [approvalError, setApprovalError] = useState<string | null>(null);

  useEffect(() => {
    if (!approvalQuery.trim()) {
      setApprovalResults([]);
      setApprovalSummary("");
      setApprovalSources([]);
      setApprovalError(null);
    }
  }, [approvalQuery]);

  const handleApprovalSearch = useCallback(async () => {
    if (!approvalQuery.trim()) {
      setApprovalError("Enter a search term to look up approvals.");
      return;
    }

    setApprovalSearching(true);
    setApprovalError(null);
    try {
      const results = await searchKb(approvalQuery.trim(), 5);
      setApprovalResults(results);
    } catch (e) {
      console.error("Approval search failed:", e);
      setApprovalError("Approval search failed.");
    } finally {
      setApprovalSearching(false);
    }
  }, [approvalQuery, searchKb]);

  const handleApprovalSummarize = useCallback(async () => {
    if (!approvalQuery.trim()) {
      setApprovalError("Enter a search term to summarize approvals.");
      return;
    }

    if (!modelLoaded) {
      onShowError("No model loaded. Go to Settings to load a model.");
      return;
    }

    setApprovalSummarizing(true);
    setApprovalError(null);
    try {
      const prompt = `Summarize the approval steps and owner(s) for: ${approvalQuery.trim()}. Keep it concise. If sources do not mention it, say so.`;
      const result = await generateWithContextParams({
        user_input: prompt,
        kb_limit: 5,
        response_length: "Short",
      });

      setApprovalSummary(result.text);
      setApprovalSources(result.sources);
    } catch (e) {
      console.error("Approval summary failed:", e);
      setApprovalError("Approval summary failed.");
    } finally {
      setApprovalSummarizing(false);
    }
  }, [approvalQuery, modelLoaded, generateWithContextParams, onShowError]);

  const resetApproval = useCallback(() => {
    setApprovalQuery("");
    setApprovalResults([]);
    setApprovalSummary("");
    setApprovalSources([]);
    setApprovalError(null);
    setApprovalSearching(false);
    setApprovalSummarizing(false);
  }, []);

  return {
    approvalQuery,
    setApprovalQuery,
    approvalResults,
    setApprovalResults,
    approvalSearching,
    approvalSummary,
    setApprovalSummary,
    approvalSummarizing,
    approvalSources,
    setApprovalSources,
    approvalError,
    setApprovalError,
    handleApprovalSearch,
    handleApprovalSummarize,
    resetApproval,
  };
}
