# 0004. Frontend Domain Seams For Workspace Evolution

## Status

Accepted

## Context

The frontend accumulated too much unrelated behavior inside a small number of broad files:

- `DraftTab.tsx` owned workspace state, derived artifacts, command wiring, autosave, draft loading, and presentation.
- `useFeatureOps.ts` mixed workspace, queue, analytics, deployment, and settings RPC calls behind one hook.
- `src/types/index.ts` acted as a large shared barrel, which made domain boundaries harder to see and harder to change safely.

This made Batch 1-4 simplification work more expensive than it should have been. Small UI changes kept requiring edits across the same monolithic files, and higher-risk workspace behaviors such as autosave identity and runbook scope migration had no clear seam for focused tests.

Batch 5 needed a frontend refactor that increased leverage without reopening product-surface decisions, backend command names, or schema boundaries.

## Decision

We introduced additive frontend domain seams and kept compatibility contracts stable for one wave.

### Domain-owned frontend facades

We split the old mixed RPC hook into narrower hooks:

- `useWorkspaceOps`
- `useQueueOps`
- `useInsightsOps`
- `useSettingsOps`

`useFeatureOps` remains as a temporary forwarding shim so unchanged callers still work during the transition wave.

### Additive domain type modules

We introduced domain type modules under `src/types/`:

- `workspace.ts`
- `workspaceOps.ts`
- `queue.ts`
- `insights.ts`
- `knowledge.ts`
- `settings.ts`

The legacy `src/types/index.ts` remains a compatibility surface for one wave so existing imports do not have to move all at once.

### Workspace hook extraction

We moved workspace responsibilities into focused hooks:

- `useWorkspaceCatalog`
  - resolution kits
  - favorites
  - runbook templates
  - active session hydration
- `useWorkspaceDerivedArtifacts`
  - handoff pack
  - evidence pack
  - KB draft
  - missing questions
  - next actions
  - derived workspace draft state
- `useWorkspaceCommandBridge`
  - `WORKSPACE_*` event wiring
- `useWorkspaceDraftState`
  - loaded-draft application
  - unsaved-work open confirmations
  - autosave identity handling
  - runbook scope migration
  - personalization persistence

### Presentational workspace seams

`DraftTab` remains the imperative workspace container for this wave, but the visible shell is decomposed into:

- `WorkspaceModeShell`
- `WorkspaceWorkflowStrip`
- `WorkspacePanels`
- `WorkspaceDialogs`

This keeps product behavior stable while shrinking the amount of UI markup and state choreography in the container.

## Consequences

### Benefits

- Workspace behavior now has focused seam tests instead of only end-to-end coverage through one large component.
- Frontend callers can depend on smaller domain facades instead of a catch-all operations hook.
- Future Batch 6 command/module work can move behind clearer frontend boundaries.
- Product-surface decisions from earlier batches stay stable while internal ownership becomes easier to change.

### Tradeoffs

- `useFeatureOps` and `src/types/index.ts` remain temporarily as compatibility layers, so the architecture is cleaner but not fully simplified yet.
- `DraftTab` is thinner, not small. This batch improves boundaries without fully rewriting the workspace container.
- Some type definitions now exist in both the legacy barrel and domain modules for one transition wave.

### Risks Accepted

- The workspace draft-state hook now owns high-risk behavior such as autosave and draft replacement rules, so regressions there must be guarded by explicit contract tests.
- Compatibility layers can linger if later cleanup batches do not remove them on schedule.

## Alternatives Considered

### Keep `DraftTab` intact and only add comments

Rejected because comments do not create testable boundaries or reduce change risk.

### Rewrite the entire workspace in one batch

Rejected because it would reopen product behavior, shell contracts, and user flows at the same time.

### Split frontend and backend seams together in one wave

Rejected because it would mix high-risk workspace behavior changes with command/module churn, making failures harder to isolate and roll back.
