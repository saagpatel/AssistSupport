// @vitest-environment jsdom
import type { ComponentProps } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TicketWorkspaceRail } from "./TicketWorkspaceRail";
import type {
  CaseIntake,
  GuidedRunbookSession,
  GuidedRunbookTemplate,
  ResolutionKit,
  SimilarCase,
  WorkspaceFavorite,
  WorkspacePersonalization,
} from "../../types/workspace";

const baseIntake: CaseIntake = {
  issue: "VPN disconnects every morning",
  impact: "Remote team loses access at shift start",
  affected_system: "VPN gateway",
  steps_tried: "Reset profile",
  blockers: "West region still affected",
  note_audience: "internal-note",
  missing_data: [],
};

const baseSimilarCase: SimilarCase = {
  draft_id: "draft-1",
  ticket_id: "INC-1001",
  title: "VPN outage follow-up",
  excerpt: "VPN disconnects every morning for remote users",
  response_excerpt: "Reset the VPN profile and verify MFA enrollment.",
  response_text: "Reset the VPN profile and verify MFA enrollment.",
  handoff_summary: "Escalated to network team",
  status: "finalized",
  updated_at: "2026-03-10T10:00:00.000Z",
  match_score: 0.92,
  explanation: {
    summary: "Matched on vpn, disconnects, remote.",
    matched_terms: ["vpn", "disconnects", "remote"],
    reasons: ["Previous case was finalized."],
    authoritative: true,
  },
};

const baseResolutionKit: ResolutionKit = {
  id: "kit-1",
  name: "VPN Incident Starter",
  summary: "Use for repeated VPN incidents.",
  category: "incident",
  response_template: "We are reviewing the VPN incident.",
  checklist_items: ["Confirm scope", "Check recent network changes"],
  kb_document_ids: ["doc-1"],
  runbook_scenario: "security-incident",
  approval_hint: null,
};

const baseRunbookTemplate: GuidedRunbookTemplate = {
  id: "runbook-template-1",
  name: "Security Incident",
  scenario: "security-incident",
  steps: ["Acknowledge incident", "Contain access"],
};

const baseRunbookSession: GuidedRunbookSession = {
  id: "runbook-session-1",
  scenario: "security-incident",
  status: "active",
  steps: ["Acknowledge incident", "Contain access"],
  current_step: 1,
  evidence: [
    {
      id: "evidence-1",
      session_id: "runbook-session-1",
      step_index: 0,
      status: "completed",
      evidence_text: "Incident acknowledged in Slack.",
      skip_reason: null,
      created_at: "2026-03-10T10:01:00.000Z",
    },
  ],
};

const baseFavorites: WorkspaceFavorite[] = [
  {
    id: "favorite-1",
    kind: "kit",
    label: "VPN Incident Starter",
    resource_id: "kit-1",
    metadata: { category: "incident" },
  },
];

const basePersonalization: WorkspacePersonalization = {
  preferred_note_audience: "internal-note",
  preferred_output_length: "Medium",
  favorite_queue_view: "all",
  default_evidence_format: "clipboard",
};

type RailProps = ComponentProps<typeof TicketWorkspaceRail>;

function makeBundles(): RailProps {
  return {
    intake: {
      data: baseIntake,
      onChange: vi.fn(),
      onAnalyze: vi.fn(),
      onApplyPreset: vi.fn(),
      onNoteAudienceChange: vi.fn(),
      missingQuestions: [],
    },
    nextActions: {
      items: [],
      onAccept: vi.fn(),
    },
    similarCases: {
      items: [baseSimilarCase],
      loading: false,
      onRefresh: vi.fn(),
      onOpen: vi.fn(),
      onCompare: vi.fn(),
      onCompareLast: vi.fn(),
      compareCase: null,
      onCloseCompare: vi.fn(),
    },
    packs: {
      handoffPack: {
        summary: "VPN issue under review",
        actions_taken: ["Reset VPN profile"],
        current_blocker: "West region still affected",
        next_step: "Escalate to network engineering",
        customer_safe_update: "We are actively working the VPN issue.",
        escalation_note: "Escalate the remaining west region failures.",
      },
      evidencePack: {
        title: "Evidence Pack · INC-1001",
        summary: "VPN issue under review",
        sections: [],
      },
      kbDraft: {
        title: "VPN disconnects every morning",
        summary: "Repeated VPN disconnects for remote users.",
        symptoms: "Users disconnect every morning.",
        environment: "Managed Windows laptops",
        cause: "Likely regional gateway issue",
        resolution: "Reset profile and escalate to network engineering.",
        warnings: [],
        prerequisites: [],
        policy_links: [],
        tags: ["incident"],
      },
      onCopyHandoff: vi.fn(),
      onCopyEvidence: vi.fn(),
      onCopyKb: vi.fn(),
    },
    kits: {
      items: [baseResolutionKit],
      onSaveCurrent: vi.fn(),
      onApply: vi.fn(),
    },
    favorites: {
      items: baseFavorites,
      onToggle: vi.fn(),
    },
    runbooks: {
      templates: [baseRunbookTemplate],
      session: baseRunbookSession,
      note: "",
      onNoteChange: vi.fn(),
      onStart: vi.fn(),
      onAdvance: vi.fn(),
      onCopyProgress: vi.fn(),
    },
    personalization: {
      value: basePersonalization,
      onChange: vi.fn(),
    },
    workspaceCatalogLoading: false,
    currentResponse: "Reset the VPN profile and verify MFA enrollment.",
  };
}

function renderRail(overrides: Partial<RailProps> = {}) {
  const props: RailProps = { ...makeBundles(), ...overrides };
  return {
    props,
    ...render(<TicketWorkspaceRail {...props} />),
  };
}

function getRailRoot(container: HTMLElement) {
  const root = container.firstElementChild;
  expect(root).toBeTruthy();
  return root as HTMLElement;
}

describe("TicketWorkspaceRail", () => {
  it("exposes compare, kits, favorites, and guided runbook actions from the workspace rail", async () => {
    const user = userEvent.setup();
    const { props, container } = renderRail();
    const rail = getRailRoot(container);

    const similarCasesSection = within(rail)
      .getByRole("heading", { name: "Similar solved cases" })
      .closest("section");
    const resolutionKitsSection = within(rail)
      .getByRole("heading", { name: "Resolution kits" })
      .closest("section");
    const guidedRunbooksSection = within(rail)
      .getByRole("heading", { name: "Guided runbooks" })
      .closest("section");

    expect(similarCasesSection).toBeTruthy();
    expect(resolutionKitsSection).toBeTruthy();
    expect(guidedRunbooksSection).toBeTruthy();

    await user.click(
      within(similarCasesSection as HTMLElement).getByRole("button", {
        name: "Compare latest",
      }),
    );
    await user.click(
      within(resolutionKitsSection as HTMLElement).getByRole("button", {
        name: "Apply kit",
      }),
    );
    await user.click(
      within(guidedRunbooksSection as HTMLElement).getByRole("button", {
        name: "Copy into notes",
      }),
    );

    expect(props.similarCases.onCompareLast).toHaveBeenCalledTimes(1);
    expect(props.kits.onApply).toHaveBeenCalledTimes(1);
    expect(props.runbooks.onCopyProgress).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Favorites")).toBeTruthy();
    expect(screen.getByText("Guided runbooks")).toBeTruthy();
  });

  it("marks the active note audience as pressed and persists personalization changes through callbacks", async () => {
    const user = userEvent.setup();
    const { props, container } = renderRail();
    const rail = getRailRoot(container);

    const noteAudienceGroup = within(rail).getByRole("group", {
      name: "Note audience",
    });
    const personalizationSection = within(rail)
      .getByRole("heading", { name: "Personalization" })
      .closest("div");

    expect(personalizationSection).toBeTruthy();

    const internalNote = within(noteAudienceGroup).getByRole("button", {
      name: "Internal note",
    });
    expect(internalNote.getAttribute("aria-pressed")).toBe("true");

    await user.selectOptions(
      within(personalizationSection as HTMLElement).getByRole("combobox", {
        name: "Default output length",
      }),
      "Long",
    );

    expect(props.personalization.onChange).toHaveBeenCalledWith({
      preferred_output_length: "Long",
    });
  });

  it("shows empty states when the catalog is unavailable and compare is not ready", () => {
    const base = makeBundles();
    const { container } = renderRail({
      currentResponse: "",
      similarCases: { ...base.similarCases, items: [] },
      kits: { ...base.kits, items: [] },
      favorites: { ...base.favorites, items: [] },
      runbooks: { ...base.runbooks, session: null, templates: [] },
    });
    const rail = getRailRoot(container);

    expect(
      within(rail).getByText("No similar cases yet for this ticket."),
    ).toBeTruthy();
    expect(within(rail).getByText(/No saved kits yet/)).toBeTruthy();
    expect(within(rail).getByText(/No favorites yet/)).toBeTruthy();
    expect(within(rail).getByText(/No guided runbook active yet/)).toBeTruthy();
    const similarCasesSection = within(rail)
      .getByRole("heading", { name: "Similar solved cases" })
      .closest("section");
    expect(similarCasesSection).toBeTruthy();
    expect(
      within(similarCasesSection as HTMLElement)
        .getByRole("button", { name: "Compare latest" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });
});
