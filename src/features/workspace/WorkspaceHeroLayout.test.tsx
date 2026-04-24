// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceHeroLayoutProps } from "./WorkspaceHeroLayout";
import { WorkspaceHeroLayout } from "./WorkspaceHeroLayout";

function baseProps(
  overrides: Partial<WorkspaceHeroLayoutProps> = {},
): WorkspaceHeroLayoutProps {
  return {
    ticket: null,
    ticketId: null,
    input: "",
    onInputChange: vi.fn(),
    responseLength: "Medium",
    onResponseLengthChange: vi.fn(),
    hasInput: false,
    hasDiagnosis: false,
    hasResponseReady: false,
    handoffTouched: false,
    response: "",
    streamingText: "",
    isStreaming: false,
    sources: [],
    metrics: null,
    confidence: null,
    grounding: [],
    alternatives: [],
    generating: false,
    modelLoaded: true,
    loadedModelName: "llama3.1-8b-instruct",
    caseIntake: {},
    onIntakeFieldChange: vi.fn(),
    onGenerate: vi.fn(),
    onCancel: vi.fn(),
    onCopyResponse: vi.fn(),
    onSaveAsTemplate: vi.fn(),
    onUseAlternative: vi.fn(),
    ...overrides,
  };
}

describe("WorkspaceHeroLayout", () => {
  afterEach(() => cleanup());

  it("shows the empty helper copy when no response exists and a model is loaded", () => {
    render(<WorkspaceHeroLayout {...baseProps()} />);
    expect(
      screen.getByText(
        /press Generate to draft|KB-grounded draft appears here/i,
      ),
    ).toBeTruthy();
  });

  it("renders the answer prose, cited sources, and claims-supported metric when a grounded response exists", () => {
    const props = baseProps({
      response:
        "Removable media is permitted on company-issued Macs per IT Security Policy 4.2.[1]\n\nFor short-term travel use you need an approved encrypted drive.[2]",
      hasResponseReady: true,
      sources: [
        {
          chunk_id: "a",
          file_path: "policies/security-4.2.md",
          title: "IT Security Policy 4.2 — Removable Media Controls",
          heading_path: "Enforcement",
          score: 0.94,
        },
        {
          chunk_id: "b",
          file_path: "kb/hardware/ironkey-d500s.md",
          title: "Kingston IronKey D500S — Standard Issue Procedure",
          heading_path: "Request flow",
          score: 0.88,
        },
      ],
      confidence: { mode: "answer", score: 0.87, rationale: "" },
      grounding: [
        {
          claim: "policy cite",
          source_indexes: [0],
          support_level: "supported",
        },
        { claim: "hardware", source_indexes: [1], support_level: "supported" },
        { claim: "extra", source_indexes: [], support_level: "unsupported" },
      ],
      metrics: {
        tokens_per_second: 42,
        sources_used: 2,
        word_count: 118,
        length_target_met: true,
        context_utilization: 0.31,
      },
    });

    render(<WorkspaceHeroLayout {...props} />);
    expect(screen.getByText(/Removable media is permitted/i)).toBeTruthy();
    // Inline citations render as clickable accent pills (one per [n] marker).
    expect(
      screen.getAllByRole("button", { name: /Policy 4\.2/i }).length,
    ).toBeGreaterThan(0);
    // Cited sources list renders both KB entries.
    expect(
      screen.getByText(/IT Security Policy 4\.2 — Removable Media Controls/i),
    ).toBeTruthy();
    expect(screen.getByText(/Kingston IronKey D500S/i)).toBeTruthy();
    // Grounded-claims summary is 2/3 — rendered in both the meta row
    // and the rail signals card, so we just assert it appears at least once.
    const matches = screen.getAllByText(
      (_, node) => node?.textContent === "2/3",
    );
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it("fires onRateResponse when the thumbs-up button is clicked and toggles the pressed state", async () => {
    const user = userEvent.setup();
    const onRateResponse = vi.fn();
    render(
      <WorkspaceHeroLayout
        {...baseProps({
          response: "A grounded draft.",
          hasResponseReady: true,
          onRateResponse,
        })}
      />,
    );

    const thumbsUp = screen.getByRole("button", {
      name: /This draft is good/i,
    });
    expect(thumbsUp.getAttribute("aria-pressed")).toBe("false");
    await user.click(thumbsUp);
    expect(onRateResponse).toHaveBeenCalledWith("up");
    expect(thumbsUp.getAttribute("aria-pressed")).toBe("true");
  });

  it("disables the generate button when the model is unloaded and surfaces the reason via title", () => {
    render(
      <WorkspaceHeroLayout
        {...baseProps({ input: "anything", modelLoaded: false })}
      />,
    );
    const generate = screen.getByRole("button", { name: /Generate/i });
    expect(generate.hasAttribute("disabled")).toBe(true);
    expect(generate.getAttribute("title")).toMatch(/Model not loaded/i);
  });
});
