import type { ParsedResponse } from "./responsePanelHelpers";

export type ResponseSection = "output" | "instructions";

interface ResponsePanelSectionsProps {
  parsed: ParsedResponse;
  response: string;
  activeSection: ResponseSection;
  onSelectSection: (section: ResponseSection) => void;
  onResponseChange?: (text: string) => void;
}

export function ResponsePanelSections({
  parsed,
  response,
  activeSection,
  onSelectSection,
  onResponseChange,
}: ResponsePanelSectionsProps) {
  return (
    <>
      {parsed.hasSections && (
        <div className="response-section-tabs">
          <button
            className={`response-section-tab${activeSection === "output" ? " active" : ""}`}
            onClick={() => onSelectSection("output")}
          >
            Output
            <span className="section-tab-hint">Copy &amp; Send</span>
          </button>
          <button
            className={`response-section-tab${activeSection === "instructions" ? " active" : ""}`}
            onClick={() => onSelectSection("instructions")}
          >
            IT Support Instructions
          </button>
        </div>
      )}

      {(!parsed.hasSections || activeSection === "output") && (
        <textarea
          className="response-textarea"
          value={parsed.hasSections ? parsed.output : response}
          onChange={(e) => {
            if (!parsed.hasSections) {
              onResponseChange?.(e.target.value);
            } else {
              const newFull = `### OUTPUT\n${e.target.value}\n\n### IT SUPPORT INSTRUCTIONS\n${parsed.instructions}`;
              onResponseChange?.(newFull);
            }
          }}
          placeholder="Response will appear here..."
          readOnly={!onResponseChange}
        />
      )}

      {parsed.hasSections && activeSection === "instructions" && (
        <div className="instructions-content">{parsed.instructions}</div>
      )}
    </>
  );
}
