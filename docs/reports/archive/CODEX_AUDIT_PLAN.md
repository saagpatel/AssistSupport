> **Archived 2026-04-21.** Superseded by
> [docs/plans/product-improvements-roadmap.md](../../plans/product-improvements-roadmap.md)
> and [docs/plans/current-remediation-plan.md](../../plans/current-remediation-plan.md).
> Retained for historical reference only.

# AssistSupport Audit Plan

## Summary

- AssistSupport's strongest product is the local-first operator workflow: workspace drafting, queue handling, KB reuse, and guided resolution.
- The biggest drag is not missing functionality. It is feature sprawl, dual UI paths, and admin/demo surfaces living beside the core workflow as if they were equal product surfaces.
- The audit recommendation is subtraction first: collapse overlapping surfaces, stop preserving preview-era architecture, and only then refactor the surviving seams.

## Systems Not Worth Saving As-Is

- `Pilot` is not worth preserving as a standalone surface. It duplicates feedback and analytics concerns without belonging to the daily operator workflow.
- `Ops` is not worth preserving as a first-class top-level tab. Deployment preflight, eval harnesses, artifact verification, and integration setup behave like internal control-plane tooling, not operator product value.
- The revamp transition architecture is not worth preserving. The repo is carrying legacy and revamp shells in parallel after the revamp path already became the default.
- The current multi-tab knowledge stack is not worth preserving intact. `Sources`, `Knowledge`, and `Search` are overlapping entry points into the same knowledge lifecycle.

## Features Overbuilt Relative To User Value

- Collaboration dispatch preview/history is overbuilt for a feature that is still default-off and manual-confirmation only.
- Pilot query testing, raw query logs, and CSV export are overbuilt relative to operator value. They are internal validation tools, not first-class product surfaces.
- Deployment, eval, triage clustering, and integration management are overbuilt inside the desktop shell. Those flows belong in scripts, CI, or a tightly scoped internal admin mode.
- Queue coaching, analytics, and pilot instrumentation together create too many separate “insight” surfaces for a small desktop product.
- Feature-flag breadth is overbuilt. Too many flags now preserve alternate UI generations instead of enforcing real policy or capability boundaries.

## Ongoing Maintenance Tax

- The app shell is carrying too many top-level tabs for one local support tool.
- The repo still preserves both legacy and revamp paths for workspace and queue flows.
- Critical modules have become structural liabilities:
  - `src/components/Draft/DraftTab.tsx`
  - `src-tauri/src/commands/mod.rs`
  - `src-tauri/src/db/mod.rs`
  - `src/components/Settings/SettingsTab.tsx`
  - `src/hooks/useFeatureOps.ts`
  - `src/types/index.ts`
- Admin-only or default-off surfaces still force changes across shared shell, command palette, tests, and navigation.

## Merge / Remove / Replace Decisions

- Merge `Analytics` and `Pilot` into one admin-only insights surface.
- Merge `Sources`, `Knowledge`, and `Search` into one knowledge surface.
- Remove `Ops` from primary navigation and reduce it to true internal operations tooling.
- Remove legacy shell and queue/workspace dual-path routing once the canonical revamp path is stable.
- Replace multi-domain frontend helpers with domain-owned clients and types.
- Replace monolithic backend registries with domain modules behind stable compatibility seams.

## Where Partial Rebuild Beats Incremental Patching

- App shell navigation and tab model.
- Workspace container and panel composition around `DraftTab`.
- Pilot/analytics framing and admin-surface structure.
- Tauri command registration layout.

## Systems To Stabilize Before Cutting

- Workspace autosave and saved-draft identity.
- Runbook scope migration and reopen flows.
- Security, startup, recovery, and backup behavior.
- Search API auth and runtime validation.

## Recommended Product Shape

- Core operator product:
  - Workspace
  - Queue
  - Knowledge
  - Settings
- Secondary admin/internal surfaces:
  - Analytics / Insights
  - Operations
- Deprecated / remove from primary product:
  - Pilot
  - Search as a standalone tab
  - Ingest as a standalone tab
  - Legacy shell and legacy queue/workspace routes

## Audit Conclusion

- The product worth keeping is the support workspace.
- The architecture worth removing is the preview-era overlap around it.
- The next implementation program should prioritize shell contraction, product-surface consolidation, and seam extraction before any deep backend rewrite.
