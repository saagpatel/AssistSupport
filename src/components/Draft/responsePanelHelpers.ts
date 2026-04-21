import type { ConfidenceAssessment } from "../../types/llm";

export interface ParsedResponse {
  output: string;
  instructions: string;
  hasSections: boolean;
}

export function parseResponseSections(text: string): ParsedResponse {
  if (!text) return { output: "", instructions: "", hasSections: false };

  const outputMatch = text.match(/^###\s+OUTPUT\s*$/im);
  const instructionsMatch = text.match(
    /^###\s+IT\s+SUPPORT\s+INSTRUCTIONS\s*$/im,
  );

  if (!outputMatch || !instructionsMatch) {
    return { output: text, instructions: "", hasSections: false };
  }

  const outputStart = outputMatch.index! + outputMatch[0].length;
  const instructionsStart =
    instructionsMatch.index! + instructionsMatch[0].length;

  const outputText = text.slice(outputStart, instructionsMatch.index!).trim();
  const instructionsText = text.slice(instructionsStart).trim();

  return {
    output: outputText,
    instructions: instructionsText,
    hasSections: true,
  };
}

export function getModeLabel(mode: ConfidenceAssessment["mode"]): string {
  if (mode === "answer") return "Ready to answer";
  if (mode === "clarify") return "Needs clarification";
  return "Abstain suggested";
}

export interface ConfidenceLevel {
  label: string;
  className: string;
  explanation: string;
}

export function getConfidenceLevel(avgScore: number): ConfidenceLevel {
  const pct = avgScore * 100;
  if (pct > 80) {
    return {
      label: `${pct.toFixed(0)}% confidence`,
      className: "confidence-high",
      explanation: "Strong match",
    };
  } else if (pct >= 50) {
    return {
      label: `${pct.toFixed(0)}% confidence`,
      className: "confidence-medium",
      explanation: "Moderate — review suggested",
    };
  } else {
    return {
      label: `${pct.toFixed(0)}% confidence`,
      className: "confidence-low",
      explanation: "Weak — verify manually",
    };
  }
}

export function getSearchMethodLabel(method: string | null): string {
  if (!method) return "Search";
  switch (method) {
    case "Fts5":
      return "Keyword";
    case "Vector":
      return "Semantic";
    case "Hybrid":
      return "Hybrid";
    default:
      return method;
  }
}

export function getSourceTypeLabel(sourceType: string | null): string {
  if (!sourceType) return "";
  switch (sourceType) {
    case "file":
      return "File";
    case "url":
      return "URL";
    case "youtube":
      return "YouTube";
    case "github":
      return "GitHub";
    default:
      return sourceType;
  }
}

export function getScoreBarClassName(score: number): string {
  const pct = score * 100;
  if (pct > 80) return "score-fill-high";
  if (pct >= 50) return "score-fill-medium";
  return "score-fill-low";
}
