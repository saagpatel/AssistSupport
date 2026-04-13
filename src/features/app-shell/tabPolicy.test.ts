import { describe, expect, it } from "vitest";
import { isTabEnabled } from "./tabPolicy";
import type { RevampFlags } from "../revamp";

function makeFlags(partial: Partial<RevampFlags> = {}): RevampFlags {
  return {
    ASSISTSUPPORT_ENABLE_ADMIN_TABS: false,
    ASSISTSUPPORT_ENABLE_NETWORK_INGEST: false,
    ASSISTSUPPORT_REVAMP_APP_SHELL: false,
    ASSISTSUPPORT_REVAMP_COMMAND_PALETTE_V2: false,
    ASSISTSUPPORT_REVAMP_INBOX: false,
    ASSISTSUPPORT_REVAMP_WORKSPACE: false,
    ASSISTSUPPORT_TICKET_WORKSPACE_V2: true,
    ASSISTSUPPORT_STRUCTURED_INTAKE: true,
    ASSISTSUPPORT_SIMILAR_CASES: true,
    ASSISTSUPPORT_NEXT_BEST_ACTION: true,
    ASSISTSUPPORT_GUIDED_RUNBOOKS_V2: true,
    ASSISTSUPPORT_POLICY_APPROVAL_ASSISTANT: true,
    ASSISTSUPPORT_BATCH_TRIAGE: true,
    ASSISTSUPPORT_COLLABORATION_DISPATCH: false,
    ASSISTSUPPORT_WORKSPACE_COMMAND_PALETTE: true,
    ASSISTSUPPORT_LLM_ROUTER_V2: false,
    ...partial,
  };
}

describe("isTabEnabled", () => {
  it("keeps core operator tabs enabled by default", () => {
    const flags = makeFlags();
    expect(isTabEnabled("draft", flags)).toBe(true);
    expect(isTabEnabled("followups", flags)).toBe(true);
    expect(isTabEnabled("knowledge", flags)).toBe(true);
    expect(isTabEnabled("settings", flags)).toBe(true);
  });

  it("disables admin tabs when admin mode is not enabled", () => {
    const flags = makeFlags({ ASSISTSUPPORT_ENABLE_ADMIN_TABS: false });
    expect(isTabEnabled("analytics", flags)).toBe(false);
    expect(isTabEnabled("ops", flags)).toBe(false);
  });

  it("enables only surviving admin tabs when admin mode is turned on", () => {
    const flags = makeFlags({
      ASSISTSUPPORT_ENABLE_ADMIN_TABS: true,
      ASSISTSUPPORT_ENABLE_NETWORK_INGEST: true,
    });
    expect(isTabEnabled("analytics", flags)).toBe(true);
    expect(isTabEnabled("ops", flags)).toBe(true);
  });
});
