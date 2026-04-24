# Workspace Redesign — Integration Guide

Step-by-step wiring for the implementing agent. The redesign ships
behind a revamp feature flag so the current `ClaudeDesignWorkspace`
layout stays reachable for comparison and rollback.

## 1. Feature flag

Add a new entry alongside the existing revamp flags in
[`src/features/revamp/flags.ts`](../../src/features/revamp/flags.ts):

```ts
export interface RevampFlags {
  // ...existing flags...
  ASSISTSUPPORT_REVAMP_WORKSPACE_HERO?: boolean;
}
```

Default value: `true` in dev, read from the same
`ASSISTSUPPORT_*` env convention the other revamp flags use. The flag
is checked inside `DraftTab.tsx` only.

## 2. Swap the renderer in DraftTab

In [`src/components/Draft/DraftTab.tsx`](../../src/components/Draft/DraftTab.tsx):

1. Add a sibling import next to the existing `ClaudeDesignWorkspace`:

   ```ts
   import { WorkspaceHeroLayout } from "../../features/workspace/WorkspaceHeroLayout";
   ```

2. Resolve the flag once (the file already calls `resolveRevampFlags()`
   elsewhere — reuse that reference). At the point that currently
   builds `claudeDesignWorkspacePanel`, branch on the flag:

   ```tsx
   const workspacePanel = revampFlags.ASSISTSUPPORT_REVAMP_WORKSPACE_HERO ? (
     <WorkspaceHeroLayout
       ticket={currentTicket}
       ticketId={currentTicketId}
       /* …identical prop set as ClaudeDesignWorkspace… */
       onRateResponse={handleRateResponse}
       onFlagKbGap={handleFlagKbGap}
       retrievalLatencyMs={lastRetrievalLatencyMs}
     />
   ) : (
     claudeDesignWorkspacePanel
   );
   ```

3. Replace the single return site that renders
   `claudeDesignWorkspacePanel` with `workspacePanel`.

The three new props (`onRateResponse`, `onFlagKbGap`,
`retrievalLatencyMs`) are optional. If the Draft tab does not already
have handlers for them the rail renders as informational only — no
wiring is strictly required for the first commit.

## 3. CSS import

The new component imports its own CSS at the top of the file
(`import "../../styles/revamp/workspaceHero.css";`) — no change
required in `App.css` or `styles/revamp/index.css`.

## 4. Tests

1. Duplicate the existing
   `src/features/workspace/ClaudeDesignWorkspace.tsx` test coverage
   (currently exercised via the DraftTab component tests) onto the new
   renderer. A drop-in `WorkspaceHeroLayout.test.tsx` next to the
   component is the expected location.
2. Run the Workspace performance suite to confirm there's no regression:
   ```bash
   pnpm perf:workspace
   ```
3. Run the repo health path before opening a PR:
   ```bash
   pnpm health:repo
   ```

Visual regression snapshots in `tests/ui/*.spec.ts` will need an
`--update-snapshots` pass (`pnpm ui:test:visual:update`) once the
redesign is landed behind the flag **and** the flag is turned on in
the test harness.

## 5. Rollback plan

The old renderer is not deleted. To roll back:

1. Flip `ASSISTSUPPORT_REVAMP_WORKSPACE_HERO` to `false` at the env
   level, or
2. Revert the single `workspacePanel` branch in `DraftTab.tsx`.

No token, shell, or other tab is touched — the redesign cannot break
surfaces outside the Draft tab.

## 6. Out of scope for this change

- Do not consolidate the rail into a shared component with the
  existing `TicketWorkspaceRail.tsx`. That component powers the Queue
  context, not the Draft tab. Sharing would require a larger refactor
  and is explicitly a non-goal here.
- Do not move audience / tone / urgency / environment into a separate
  settings modal. They belong inside the rail.
- Do not delete `ClaudeDesignWorkspace.tsx` or its CSS. Keep both
  around until the redesign has been running on `true` for two release
  cycles, then remove in a dedicated cleanup PR.

## 7. Commit hygiene

Recommended commit sequence (keeps each commit atomic and easy to
revert):

1. `feat(workspace): add WorkspaceHeroLayout renderer`
2. `feat(workspace): scoped hero-layout CSS`
3. `feat(revamp): wire WORKSPACE_HERO flag into DraftTab`
4. `test(workspace): cover WorkspaceHeroLayout render paths`

Branch name convention: `codex/feat/workspace-hero-layout`.
