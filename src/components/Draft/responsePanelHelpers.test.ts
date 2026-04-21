import { describe, expect, it } from "vitest";
import {
  parseResponseSections,
  getModeLabel,
  getConfidenceLevel,
  getSearchMethodLabel,
  getSourceTypeLabel,
  getScoreBarClassName,
} from "./responsePanelHelpers";

describe("parseResponseSections", () => {
  it("returns empty parse for empty input", () => {
    expect(parseResponseSections("")).toEqual({
      output: "",
      instructions: "",
      hasSections: false,
    });
  });

  it("falls back to whole-text output when section headers are missing", () => {
    const legacy = "Plain response without section markers.";
    const parsed = parseResponseSections(legacy);
    expect(parsed.hasSections).toBe(false);
    expect(parsed.output).toBe(legacy);
    expect(parsed.instructions).toBe("");
  });

  it("splits OUTPUT and IT SUPPORT INSTRUCTIONS sections", () => {
    const text = [
      "### OUTPUT",
      "Please reset the password via the portal.",
      "",
      "### IT SUPPORT INSTRUCTIONS",
      "Verify ticket in Jira, then log the reset.",
    ].join("\n");
    const parsed = parseResponseSections(text);
    expect(parsed.hasSections).toBe(true);
    expect(parsed.output).toBe("Please reset the password via the portal.");
    expect(parsed.instructions).toBe(
      "Verify ticket in Jira, then log the reset.",
    );
  });
});

describe("getModeLabel", () => {
  it("maps each mode to a human-readable label", () => {
    expect(getModeLabel("answer")).toBe("Ready to answer");
    expect(getModeLabel("clarify")).toBe("Needs clarification");
    expect(getModeLabel("abstain")).toBe("Abstain suggested");
  });
});

describe("getConfidenceLevel", () => {
  it("classifies high, medium, and low bands", () => {
    expect(getConfidenceLevel(0.9).className).toBe("confidence-high");
    expect(getConfidenceLevel(0.6).className).toBe("confidence-medium");
    expect(getConfidenceLevel(0.3).className).toBe("confidence-low");
  });

  it("formats the label as rounded percent", () => {
    expect(getConfidenceLevel(0.87).label).toBe("87% confidence");
  });
});

describe("getSearchMethodLabel", () => {
  it("renders readable labels for known methods and a fallback for unknown", () => {
    expect(getSearchMethodLabel(null)).toBe("Search");
    expect(getSearchMethodLabel("Fts5")).toBe("Keyword");
    expect(getSearchMethodLabel("Vector")).toBe("Semantic");
    expect(getSearchMethodLabel("Hybrid")).toBe("Hybrid");
    expect(getSearchMethodLabel("custom")).toBe("custom");
  });
});

describe("getSourceTypeLabel", () => {
  it("returns readable labels for known types and empty string for null", () => {
    expect(getSourceTypeLabel(null)).toBe("");
    expect(getSourceTypeLabel("file")).toBe("File");
    expect(getSourceTypeLabel("url")).toBe("URL");
    expect(getSourceTypeLabel("youtube")).toBe("YouTube");
    expect(getSourceTypeLabel("github")).toBe("GitHub");
    expect(getSourceTypeLabel("other")).toBe("other");
  });
});

describe("getScoreBarClassName", () => {
  it("buckets scores into high, medium, low CSS classes", () => {
    expect(getScoreBarClassName(0.9)).toBe("score-fill-high");
    expect(getScoreBarClassName(0.6)).toBe("score-fill-medium");
    expect(getScoreBarClassName(0.2)).toBe("score-fill-low");
  });
});
