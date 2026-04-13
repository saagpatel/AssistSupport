import type { RevampFlags } from "../revamp";
import type { TabId } from "./types";

export function isTabEnabled(tab: TabId, flags: RevampFlags): boolean {
  if (tab === "analytics" || tab === "ops") {
    return Boolean(flags.ASSISTSUPPORT_ENABLE_ADMIN_TABS);
  }

  return true;
}
