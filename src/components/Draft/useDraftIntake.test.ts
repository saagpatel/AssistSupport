// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { INTAKE_PRESETS, useDraftIntake } from "./useDraftIntake";

function makeOptions(
  overrides: Partial<Parameters<typeof useDraftIntake>[0]> = {},
) {
  return {
    initialNoteAudience: "internal-note" as const,
    input: "",
    currentTicket: null,
    currentTicketId: null,
    response: "",
    logEvent: vi.fn().mockResolvedValue(undefined),
    setWorkspacePersonalization: vi.fn(),
    ...overrides,
  };
}

describe("useDraftIntake", () => {
  it("updates individual intake fields", () => {
    const { result } = renderHook(() => useDraftIntake(makeOptions()));

    act(() => {
      result.current.handleIntakeFieldChange("issue", "VPN outage");
    });
    expect(result.current.caseIntake.issue).toBe("VPN outage");

    act(() => {
      result.current.handleIntakeFieldChange("impact", "west region");
    });
    expect(result.current.caseIntake.impact).toBe("west region");
    expect(result.current.caseIntake.issue).toBe("VPN outage");
  });

  it("applies preset values and logs the event", () => {
    const logEvent = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useDraftIntake(makeOptions({ logEvent })),
    );

    act(() => {
      result.current.handleApplyIntakePreset("incident");
    });

    expect(result.current.caseIntake.likely_category).toBe(
      INTAKE_PRESETS.incident.likely_category,
    );
    expect(result.current.caseIntake.urgency).toBe(
      INTAKE_PRESETS.incident.urgency,
    );
    expect(logEvent).toHaveBeenCalledWith("workspace_intake_preset_applied", {
      preset: "incident",
    });
  });

  it("updates audience and syncs workspace personalization", () => {
    const setWorkspacePersonalization = vi.fn();
    const { result } = renderHook(() =>
      useDraftIntake(makeOptions({ setWorkspacePersonalization })),
    );

    act(() => {
      result.current.handleNoteAudienceChange("customer-safe");
    });

    expect(result.current.caseIntake.note_audience).toBe("customer-safe");
    expect(setWorkspacePersonalization).toHaveBeenCalled();
  });
});
