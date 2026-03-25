# AssistSupport Implementation Plan

## 1. Execution Strategy

- Treat `CODEX_AUDIT_PLAN.md` as the source of truth by making its creation the first execution batch.
- Optimize for subtraction first, then seam extraction, then rewrites.
- Use runtime-boundary waves:
  - docs and guardrails
  - frontend shell and surface contraction
  - workspace and queue canonicalization
  - knowledge and admin-surface consolidation
  - frontend domain seam extraction
  - Rust command split
  - DB internal split
  - search-api simplification
  - final deletion and baseline reset
- Replacement lands first, deletion lands one wave later.
- Preserve compatibility only where it reduces breakage in the next wave.

## 2. Recommended Order of Operations

1. Materialize `CODEX_AUDIT_PLAN.md` and align docs and guardrails.
2. Freeze the target product shape: one canonical shell, one queue surface, one workspace surface, one knowledge surface, one admin surface.
3. Consolidate navigation and tab model before touching backend contracts.
4. Make `QueueCommandCenterPage` and the revamp workspace the only supported queue and workspace surfaces.
5. Merge `Sources`, `Knowledge`, and `Search` into one knowledge surface.
6. Collapse `Pilot` into `Analytics` or remove it entirely, and demote `Ops` from primary navigation.
7. Extract frontend domain clients and thin `DraftTab` into a smaller workspace container plus subpanels.
8. Split `src-tauri/src/commands/mod.rs` by domain behind stable command names.
9. Split `src-tauri/src/db/mod.rs` internally behind the existing `Database` facade.
10. Simplify `search-api` only after frontend and Tauri boundaries are stable.
11. Remove dead routes, dead flags, legacy components, and rebaseline performance only after the replacements survive one merged wave.

## 3. Workstreams and Change Batches

- Batch 0: Audit source-of-truth and planning guardrails
  - Reason: later waves need a stable decision record.
  - Depends on: approved audit conclusions.
  - Deliverables: create `CODEX_AUDIT_PLAN.md`; create `CODEX_IMPLEMENTATION_PLAN.md`; update docs pointers; verify command and gate docs reflect actual scripts.
  - Validation method: docs diff review, `pnpm check:workstation-preflight`, `pnpm check:workflow-drift`, `pnpm ui:gate:static`, `pnpm test`, `cd src-tauri && cargo test`, `pnpm search-api:openapi:check`.

- Batch 1: Canonical shell and tab contraction
  - Reason: the biggest ongoing tax is dual shell routing and too many first-class tabs.
  - Depends on: Batch 0.
  - Deliverables: make `RevampShell` the only shell target; keep `Workspace`, `Queue`, `Knowledge`, `Settings`; move `Ops`, `Analytics`, and surviving diagnostics behind admin mode; remove top-level `Pilot`, `Search`, and `Ingest` from primary navigation.
  - Validation method: UI reviewer and fixer loop, screenshots, keyboard shortcut coverage, mobile and desktop Playwright parity, no broken route transitions.

- Batch 2: Queue and workspace canonicalization
  - Reason: `InboxPage` and `WorkspacePage` still preserve old and new flows in parallel.
  - Depends on: Batch 1.
  - Deliverables: make `QueueCommandCenterPage` the only queue path; make revamp workspace the only workspace path; keep old components only as unreachable compatibility code until the next batch; stabilize queue-to-workspace deep links and autosave/load flows.
  - Validation method: focused workspace and queue unit tests, smoke e2e, visual and a11y gates, runbook and autosave persistence checks.

- Batch 3: Knowledge surface consolidation
  - Reason: `Sources`, `Knowledge`, and `Search` are overlapping shells around the same KB lifecycle.
  - Depends on: Batch 1.
  - Deliverables: fold document management and KB health into `Sources`; embed hybrid search as an advanced mode inside the same surface; remove separate top-level `KnowledgePage` and `SearchPage` routing after parity.
  - Validation method: source indexing and search tests, KB browser tests, empty/error/loading states, responsive checks, search smoke, and OpenAPI contract validation.

- Batch 4: Admin-surface collapse
  - Reason: `Pilot` and much of `Ops` are overbuilt relative to operator value.
  - Depends on: Batch 1 and Batch 3.
  - Deliverables: merge useful pilot metrics into `Analytics`; move raw query logs and exports behind diagnostics; reduce `Ops` to true operational tooling only; move integration, deployment, and eval flows out of primary product framing.
  - Validation method: admin gating tests, analytics regression tests, settings and admin navigation smoke, screenshots for admin mode and non-admin mode.

- Batch 5: Frontend domain seam extraction and workspace partial rebuild
  - Reason: `DraftTab.tsx`, `useFeatureOps.ts`, and `src/types/index.ts` are blocking safe change.
  - Depends on: Batches 2-4.
  - Deliverables: introduce domain clients (`workspace`, `queue`, `knowledge`, `insights`, `settings`); split `DraftTab` into a smaller workspace container plus focused feature panels; narrow shared types into domain modules; remove the multi-domain `useFeatureOps` pattern.
  - Validation method: existing workspace tests plus new container and panel tests, coverage checks, UI state matrix, and perf workspace benchmarks.

- Batch 6: Tauri command-surface split
  - Reason: `src-tauri/src/commands/mod.rs` is too large to safely extend and too coupled to UI churn.
  - Depends on: Batch 5.
  - Deliverables: move commands into domain modules with grouped registration helpers; keep command names stable for one full wave; stop adding new commands to the giant registry.
  - Validation method: `cargo test`, `pnpm test:ci`, targeted invoke smoke coverage, security regression checks, and no command-name drift.
  - Status: completed on 2026-03-24. `src-tauri/src/commands/mod.rs` is now a thin index, command registration moved into `src-tauri/src/commands/registry.rs`, permission/build parsing follows the registry, and the command surface stayed stable for frontend callers while Batch 7 was unblocked.
  - Actual closeout verification run on the final tree: `pnpm check:workstation-preflight`, `pnpm check:workflow-drift`, `pnpm ui:gate:static`, `pnpm test`, `pnpm test:coverage`, `pnpm exec playwright test tests/ui/app-shell.spec.ts tests/ui/app-shell-responsive.spec.ts tests/ui/workspace-performance.spec.ts`, `VITE_ASSISTSUPPORT_ENABLE_ADMIN_TABS=1 pnpm exec playwright test tests/ui/admin-shell.spec.ts`, `pnpm test:e2e:smoke`, `pnpm ui:gate:regression`, `pnpm perf:workspace`, `pnpm perf:bundle`, `pnpm perf:build`, `pnpm perf:assets`, `pnpm perf:memory`, `pnpm perf:lhci`, `pnpm test:ci`, `cd src-tauri && cargo test --test permission_manifest`, `pnpm test:security-regression`, `pnpm search-api:test`, `ENVIRONMENT=production ASSISTSUPPORT_API_KEY=local-smoke-key ASSISTSUPPORT_RATE_LIMIT_STORAGE_URI=redis://127.0.0.1:6380/0 pnpm search-api:smoke`, `pnpm search-api:openapi:check`, and `pnpm git:guard:all`.

- Batch 7: DB internal split behind stable facade
  - Reason: `src-tauri/src/db/mod.rs` is oversized, but schema churn should not happen during shell churn.
  - Depends on: Batch 6.
  - Deliverables: split migrations and bootstrap from domain repositories; keep the current `Database` facade; separate drafts, knowledge, analytics, ops, and settings internals; no schema redesign in this wave.
  - Validation method: Rust tests, migration round-trip tests, backup and import safety for touched domains, and SQLite-local query health smoke checks for the moved store seams.
  - Status: completed on 2026-03-24. `src-tauri/src/db/mod.rs` now acts as a stable facade and compatibility re-export layer while the implementation bodies live in `bootstrap.rs`, `migrations.rs`, `runtime_state_store.rs`, `draft_store.rs`, `knowledge_store.rs`, `analytics_ops_store.rs`, and `workspace_store.rs`. Public `Database` behavior, schema version `15`, and frontend command contracts remained stable while Batch 8 was unblocked.
  - Actual closeout verification run on the final tree: `pnpm check:workstation-preflight`, `pnpm check:workflow-drift`, `pnpm ui:gate:static`, `pnpm test`, `pnpm test:coverage`, `pnpm exec playwright test tests/ui/app-shell.spec.ts tests/ui/app-shell-responsive.spec.ts tests/ui/workspace-performance.spec.ts`, `VITE_ASSISTSUPPORT_ENABLE_ADMIN_TABS=1 pnpm exec playwright test tests/ui/admin-shell.spec.ts`, `pnpm test:e2e:smoke`, `pnpm ui:gate:regression`, `pnpm perf:workspace`, `pnpm perf:bundle`, `pnpm perf:build`, `pnpm perf:assets`, `pnpm perf:memory`, `pnpm perf:lhci`, `pnpm test:ci`, `cd src-tauri && cargo test`, `pnpm test:security-regression`, `pnpm search-api:test`, `ENVIRONMENT=production ASSISTSUPPORT_API_KEY=local-smoke-key ASSISTSUPPORT_RATE_LIMIT_STORAGE_URI=redis://127.0.0.1:6380/0 pnpm search-api:smoke`, `pnpm search-api:openapi:check`, `pnpm git:guard:all`, `cd src-tauri && cargo test --test db_encrypted_roundtrip`, `cd src-tauri && cargo test --test data_migration`, `cd src-tauri && cargo test --test kb_pipeline`, `cd src-tauri && cargo test --test kb_disk_ingestion`, and `cd src-tauri && cargo test --test namespace_consistency`.

- Batch 8: Search API simplification
  - Reason: the sidecar should only be simplified after app-shell and Tauri seams are stable.
  - Depends on: Batches 3, 6, and 7.
  - Deliverables: reduce sidecar responsibility to the surviving product needs; remove dead retrieval, feedback, and admin complexity that no longer has a first-class UI consumer; keep auth and runtime validation strong.
  - Validation method: `pnpm search-api:test`, `pnpm search-api:smoke`, `pnpm search-api:openapi:check`, `pnpm perf:api`, `pnpm perf:db`.
  - Status: completed on 2026-03-24. The search sidecar now runs on the single adaptive runtime path the desktop app actually uses, `/ready` reflects the surviving dependency set, the public endpoint/Tauri contract stayed stable, and the repo now records the decision in `docs/adr/0007-search-api-runtime-path-simplification.md`. Whole-codebase post-implementation review found no open P0/P1 blockers, and Batch 9 is now unblocked.
  - Actual closeout verification run on the final tree: `pnpm check:workstation-preflight`, `pnpm check:workflow-drift`, `pnpm ui:gate:static`, `pnpm test`, `pnpm test:coverage`, `pnpm exec playwright test tests/ui/app-shell.spec.ts tests/ui/app-shell-responsive.spec.ts tests/ui/workspace-performance.spec.ts`, `VITE_ASSISTSUPPORT_ENABLE_ADMIN_TABS=1 pnpm exec playwright test tests/ui/admin-shell.spec.ts`, `pnpm test:e2e:smoke`, `pnpm ui:gate:regression`, `pnpm perf:workspace`, `pnpm perf:bundle`, `pnpm perf:build`, `pnpm perf:assets`, `pnpm perf:memory`, `pnpm perf:lhci`, `pnpm test:ci`, `cd src-tauri && cargo test`, `pnpm test:security-regression`, `pnpm search-api:test`, `ENVIRONMENT=production ASSISTSUPPORT_API_KEY=local-smoke-key ASSISTSUPPORT_RATE_LIMIT_STORAGE_URI=redis://127.0.0.1:6380/0 pnpm search-api:smoke`, `pnpm search-api:openapi:check`, `BASE_URL=http://127.0.0.1:3000 AUTH_TOKEN=local-smoke-key pnpm perf:api`, `env -u DATABASE_URL pnpm perf:db`, and `pnpm git:guard:all`. The Phase 8 closeout used a temporary local PostgreSQL 16 instance on `127.0.0.1:5432`, a minimal local search schema for the perf query path, and a temporary local WSGI search server on `127.0.0.1:3000` so the final perf commands ran against a real loopback sidecar instead of being skipped. Lighthouse still reports the existing non-blocking SEO warning at `0.82` against the `0.90` threshold.

- Batch 9: Deletion and baseline reset
  - Reason: code removal should trail proven replacements.
  - Depends on: Batches 1-8.
  - Deliverables: delete unreachable legacy shells, old routes, dead feature flags, dead wrappers, obsolete docs, and stale snapshots; refresh perf baselines only where the new product shape intentionally changes them.
  - Validation method: full repo gates, dead-code search, snapshot refresh review, and explicit PR note for any baseline update.
  - Status: completed on 2026-03-24. Retired queue/pilot/search wrappers are gone, `useFeatureOps.ts` is removed, the search-api compatibility residue from Batch 8 has been retired down to the surviving adaptive path, and the deletion closeout is recorded in `docs/adr/0008-compatibility-surface-retirement.md`.
  - Actual closeout verification run on the final tree: `pnpm check:workstation-preflight`, `pnpm check:workflow-drift`, `pnpm ui:gate:static`, `pnpm test`, `pnpm test:coverage`, `pnpm exec playwright test tests/ui/app-shell.spec.ts tests/ui/app-shell-responsive.spec.ts tests/ui/workspace-performance.spec.ts`, `VITE_ASSISTSUPPORT_ENABLE_ADMIN_TABS=1 pnpm exec playwright test tests/ui/admin-shell.spec.ts`, `pnpm test:e2e:smoke`, `pnpm ui:gate:regression`, `pnpm perf:workspace`, `pnpm perf:bundle`, `pnpm perf:build`, `pnpm perf:assets`, `pnpm perf:memory`, `pnpm perf:lhci`, `pnpm test:ci`, `pnpm test:security-regression`, `pnpm search-api:test`, `ENVIRONMENT=production ASSISTSUPPORT_API_KEY=local-smoke-key ASSISTSUPPORT_RATE_LIMIT_STORAGE_URI=redis://127.0.0.1:6380/0 pnpm search-api:smoke`, `pnpm search-api:openapi:check`, `BASE_URL=http://127.0.0.1:3000 AUTH_TOKEN=local-smoke-key pnpm perf:api`, `DATABASE_URL=postgresql://127.0.0.1:5432/postgres pnpm perf:db`, and `pnpm git:guard:all`. `pnpm test:ci` executed the Rust `cargo test` pack. The final closeout used a temporary local Postgres 16 instance on `127.0.0.1:5432` with a minimal BM25 table plus a temporary local loopback sidecar on `127.0.0.1:3000` for the API perf gate. Bundle size (`1,118,425`, `+8.69%`) and build time (`3282ms`, `+13.96%`) stayed within the locked thresholds, so `.perf-baselines/*` was not rebaselined. Lighthouse still reports the existing non-blocking SEO warning at `0.82` against the `0.90` threshold.
  - Closeout note: whole-codebase post-implementation review found no open P0/P1 blockers on live code paths. Historical ADR and roadmap notes still mention prior temporary compatibility decisions, but the active implementation and closeout docs now record their retirement. Batch 10 is now unblocked.

- Batch 10: Internal convergence groundwork
  - Reason: Batch 9 removed dead product wrappers, but backend/frontend compatibility ownership still needed to converge before the final hardening wave.
  - Depends on: Batch 9.
  - Deliverables: reduce `legacy_commands.rs` by moving draft, analytics, Jira, KB, and early model ownership into their domain command modules; migrate more frontend callers to domain-owned type modules; preserve product behavior while shrinking the remaining compatibility core.
  - Validation method: focused Rust command contract tests, targeted workspace/frontend tests, TypeScript typecheck, and full Rust suite reruns between ownership slices.
  - Status: completed on 2026-03-25 as groundwork for the final closeout wave. `operations_analytics_commands.rs`, `jira_commands.rs`, `draft_commands.rs`, `kb_commands.rs`, and `model_commands.rs` absorbed more of their real command ownership, and another workspace/frontend import cluster moved off the broad type barrel before the final retirements landed.
  - Actual verification run on the converged groundwork tree: `cd src-tauri && cargo test --test permission_manifest`, `cd src-tauri && cargo test --test command_contracts`, `cd src-tauri && cargo test`, `cd /Users/d/AssistSupport && pnpm exec vitest run src/features/workspace/TicketWorkspaceRail.test.tsx src/features/workspace/workspaceAssistant.test.ts src/features/workspace/useWorkspaceDraftState.test.ts src/components/Analytics/AnalyticsTab.test.tsx`, and `cd /Users/d/AssistSupport && pnpm exec tsc --noEmit`.

- Batch 11: Final convergence and hardening closeout
  - Reason: the repo still carried a few compatibility-heavy internals after Batch 10, even though the product surfaces were already stable.
  - Depends on: Batch 10.
  - Deliverables: delete `src-tauri/src/commands/legacy_commands.rs`; delete `src/types/index.ts`; narrow `src-tauri/src/db/mod.rs` to the intended stable facade; remove the final live-code `fusion_strategy` residue; update the canonical ADR and roadmap closeout record.
  - Validation method: full application pack, Rust structural guards, search-api contract validation, perf gates, and a post-implementation whole-codebase review.
  - Status: completed on 2026-03-25. `legacy_commands.rs` is retired, `src/types/index.ts` is retired, broad DB store re-exports were removed from `src-tauri/src/db/mod.rs`, and live search-path tooling no longer carries `fusion_strategy` as an active field. The architectural closeout is recorded in `docs/adr/0009-final-convergence-and-hardening-closeout.md`.
  - Actual closeout verification run on the final tree: `pnpm check:workstation-preflight`, `pnpm check:workflow-drift`, `pnpm ui:gate:static`, `pnpm test`, `pnpm test:coverage`, `pnpm exec playwright test tests/ui/app-shell.spec.ts tests/ui/app-shell-responsive.spec.ts tests/ui/workspace-performance.spec.ts`, `VITE_ASSISTSUPPORT_ENABLE_ADMIN_TABS=1 pnpm exec playwright test tests/ui/admin-shell.spec.ts`, `pnpm test:e2e:smoke`, `pnpm ui:gate:regression`, `pnpm perf:workspace`, `pnpm perf:bundle`, `pnpm perf:build`, `pnpm perf:assets`, `pnpm perf:memory`, `pnpm perf:lhci`, `pnpm test:ci`, `cd src-tauri && cargo test`, `pnpm test:security-regression`, `pnpm search-api:test`, `ENVIRONMENT=production ASSISTSUPPORT_API_KEY=local-smoke-key ASSISTSUPPORT_RATE_LIMIT_STORAGE_URI=redis://127.0.0.1:6380/0 pnpm search-api:smoke`, `pnpm search-api:openapi:check`, `BASE_URL=http://127.0.0.1:3000 AUTH_TOKEN=local-smoke-key pnpm perf:api`, `ASSISTSUPPORT_DB_HOST=127.0.0.1 ASSISTSUPPORT_DB_PORT=5432 ASSISTSUPPORT_DB_USER=assistsupport_dev ASSISTSUPPORT_DB_NAME=assistsupport_dev pnpm perf:db`, and `pnpm git:guard:all`. Focused structural and migration checks also passed: `cd src-tauri && cargo test --test permission_manifest`, `cd src-tauri && cargo test --test command_contracts`, `cd src-tauri && cargo test --test db_facade_structure`, `cd /Users/d/AssistSupport && pnpm exec tsc --noEmit`, `cd /Users/d/AssistSupport && pnpm exec vitest run src/types/importPolicy.test.ts src/features/workspace/workspaceAssistant.test.ts src/features/workspace/useWorkspaceDraftState.test.tsx src/components/Analytics/AnalyticsTab.test.tsx`, `cd /Users/d/AssistSupport && pnpm search-api:openapi:check`, and `git diff --check`.
  - Closeout note: whole-codebase post-implementation review found no open P0/P1 blockers on the final validated tree. The only carry-forward warning remains the existing non-blocking Lighthouse SEO score of `0.82` versus the `0.90` threshold. Batch 12 remains the final small polish-and-hardening wave.

- Batch 12: Final module right-sizing and release-readiness closeout
  - Reason: the product and contracts are stable, but `model_commands.rs`, `db/mod.rs`, command-module exports, and the perf harness documentation still needed final steady-state cleanup.
  - Depends on: Batch 11.
  - Deliverables: thin `src-tauri/src/commands/model_commands.rs` into a command/controller surface with helper-owned runtime modules; move remaining public DB record types into dedicated `src-tauri/src/db/types_*.rs` modules and keep `db/mod.rs` as a narrower facade/re-export index; trim `src-tauri/src/commands/mod.rs` blanket re-exports; formalize the `perf:api` and `perf:db` loopback setup in the canonical runbook; update the ADR and roadmap with the final program-close state.
  - Validation method: full application pack, Rust structural guards, search-api contract validation, UI/browser regression checks, perf lanes, and a final whole-codebase review.
  - Status: completed on 2026-03-25. `model_commands.rs` now delegates helper-heavy ownership into `model_runtime.rs`, `embedding_runtime.rs`, `download_runtime.rs`, `ocr_runtime.rs`, and `decision_tree_runtime.rs`; `src-tauri/src/db/mod.rs` now re-exports domain-owned type modules instead of defining the full record monolith inline; `src-tauri/src/commands/mod.rs` no longer blanket re-exports whole command modules; and the release-readiness harness is documented in `docs/runbooks/search-api-local-deployment.md`. The architectural decision is captured in `docs/adr/0010-final-module-right-sizing-and-release-readiness.md`.
  - Actual validation completed on the final tree: `cd src-tauri && cargo test --test command_module_structure --test command_contracts --test db_facade_structure`, `cd src-tauri && cargo test --test permission_manifest`, `cd src-tauri && cargo test`, `cd /Users/d/AssistSupport && pnpm exec tsc --noEmit`, `cd /Users/d/AssistSupport && git diff --check`, `cd /Users/d/AssistSupport && pnpm test`, `cd /Users/d/AssistSupport && pnpm search-api:test`, `cd /Users/d/AssistSupport && pnpm search-api:openapi:check`, `cd /Users/d/AssistSupport && pnpm test:ci`, `cd /Users/d/AssistSupport && pnpm check:workstation-preflight`, `cd /Users/d/AssistSupport && pnpm check:workflow-drift`, `cd /Users/d/AssistSupport && pnpm test:security-regression`, `cd /Users/d/AssistSupport && pnpm ui:gate:static`, `cd /Users/d/AssistSupport && pnpm test:coverage`, `cd /Users/d/AssistSupport && pnpm exec playwright test tests/ui/app-shell.spec.ts tests/ui/app-shell-responsive.spec.ts tests/ui/workspace-performance.spec.ts`, `cd /Users/d/AssistSupport && VITE_ASSISTSUPPORT_ENABLE_ADMIN_TABS=1 pnpm exec playwright test tests/ui/admin-shell.spec.ts`, `cd /Users/d/AssistSupport && pnpm test:e2e:smoke`, `cd /Users/d/AssistSupport && pnpm ui:gate:regression`, `cd /Users/d/AssistSupport && pnpm perf:bundle`, `cd /Users/d/AssistSupport && pnpm perf:build`, `cd /Users/d/AssistSupport && pnpm perf:assets`, `cd /Users/d/AssistSupport && pnpm perf:workspace`, `cd /Users/d/AssistSupport && pnpm perf:memory`, `cd /Users/d/AssistSupport && pnpm perf:lhci`, `cd /Users/d/AssistSupport && pnpm git:guard:all`, `cd /Users/d/AssistSupport && ASSISTSUPPORT_DB_HOST=127.0.0.1 ASSISTSUPPORT_DB_PORT=5432 ASSISTSUPPORT_DB_USER=assistsupport_dev ASSISTSUPPORT_DB_NAME=assistsupport_dev pnpm perf:db`, and `cd /Users/d/AssistSupport && BASE_URL=http://127.0.0.1:3000 AUTH_TOKEN=local-smoke-key pnpm perf:api`.
  - Closeout note: the final missing perf gates passed after bringing up temporary local PostgreSQL 16, Redis, and a loopback WSGI sidecar. `perf:db` passed via the BM25 `EXPLAIN` fallback with `execution_time_ms=2.776` and `planning_time_ms=44.086`, and `perf:api` passed with `p95=28.5ms`, `p99=100.9ms`, `failureRate=0`, and `checksRate=1`. The refactor program can now be treated as fully closed. The only carry-forward warning remains the existing non-blocking Lighthouse SEO score of `0.82` versus the `0.90` threshold, so no substantive Batch 13 implementation phase is required.

## 4. Validation and Test Plan by Batch

- Batch 0
  - Run: `pnpm check:workstation-preflight`, `pnpm check:workflow-drift`, `pnpm ui:gate:static`, `pnpm test`, `pnpm test:coverage`, `cd src-tauri && cargo test`, `pnpm search-api:openapi:check`.
  - Pass condition: docs and commands match repo reality; no behavior regressions.

- Batch 1
  - Run: `.codex/verify.commands`, `pnpm ui:gate:regression`, tab-policy tests, command-palette tests, responsive Playwright smoke.
  - Pass condition: one shell path works on desktop and narrow width; no broken nav shortcuts or hidden-tab leaks.

- Batch 2
  - Run: focused workspace and queue tests, `pnpm test:e2e:smoke`, `pnpm ui:test:a11y`, `pnpm ui:test:visual`, `pnpm perf:workspace`.
  - Pass condition: queue open/load/save/handoff flows work through the new canonical surfaces only.

- Batch 3
  - Run: KB browser tests, sources tests, hybrid search smoke, `pnpm search-api:openapi:check`, `pnpm search-api:smoke`, `pnpm ui:gate:regression`.
  - Pass condition: indexing, browse, edit, search, and delete all work from one knowledge surface.

- Batch 4
  - Run: analytics tests, admin-gating tests, settings/admin navigation smoke, screenshots, a11y.
  - Pass condition: non-admin users see a smaller product; admins still have the necessary diagnostics.

- Batch 5
  - Run: `pnpm test`, targeted workspace container tests, coverage and diff coverage, `pnpm perf:workspace`, `pnpm perf:bundle`, `pnpm perf:build`.
  - Pass condition: smaller frontend seams with no drop in core workspace behavior.

- Batch 6
  - Run: `pnpm test:ci`, `cd src-tauri && cargo test`, `pnpm test:security-regression`.
  - Pass condition: command registration is split but frontend callers do not change behavior.
  - Closeout note: the Batch 6 final validation pack also includes the full-application frontend, performance, search-api, and git-guard lanes required by the active execution policy before the phase is treated as complete.

- Batch 7
  - Run: Rust tests, migration safety tests, backup/export/import tests for touched domains, and SQLite-local query health smoke checks in Rust.
  - Pass condition: DB internals are separated with unchanged runtime behavior and safe migrations.
  - Closeout note: the final Batch 7 validation pack also included the full-application frontend, performance, security, search-api, git-guard, and explicit DB-focused Rust subsets before the phase was treated as complete. Lighthouse still reports the existing non-blocking SEO warning at `0.82` against the `0.90` threshold.

- Batch 8
  - Run: `pnpm search-api:test`, `pnpm search-api:smoke`, `pnpm search-api:openapi:check`, `pnpm perf:api`, `pnpm perf:db`.
  - Pass condition: sidecar still meets surviving product use cases and budgets.

- Batch 9
  - Run: all blocking gates from prior batches plus explicit dead-code and snapshot review.
  - Pass condition: removal-only PRs are cleanly reversible and leave no broken references.

## 5. Benchmark Plan

- Capture before and after every batch:
  - `pnpm perf:bundle`
  - `pnpm perf:build`
  - `pnpm perf:assets`
- Capture before and after every UI-affecting batch:
  - `pnpm perf:memory`
  - `pnpm perf:workspace`
  - `pnpm perf:lhci`
- Capture before and after every search/runtime batch:
  - `pnpm perf:api`
  - `pnpm perf:db`
  - `pnpm search-api:smoke`
- Track these product metrics through the refactor:
  - workspace ready time
  - queue batch-triage time
  - similar-case lookup latency
  - next-action latency
  - search latency and error rate
- Do not update `.perf-baselines/*` until Batch 9 unless a benchmark harness itself changes and the reason is documented in the PR.

## 6. High-Risk Areas to Isolate

- Workspace autosave, saved-draft identity, runbook scope migration, and reopen flows.
- Shell and tab removal.
- Tauri command splitting.
- DB internal split.
- Search sidecar simplification.
- Admin-surface collapse.

## 7. Delete / Stabilize / Rewrite Decisions

- Delete first only after replacements exist:
  - legacy shell path in `App.tsx`
  - unreachable `FollowUpsTab` routing path
  - `QueueFirstInboxPage.tsx`
  - top-level `PilotPage`, `SearchPage`, and `KnowledgePage` routes
  - revamp-era UI flags that only preserve alternate structure
- Stabilize first:
  - `RevampShell` as the only shell
  - queue-to-workspace navigation
  - surviving tabs: `Workspace`, `Queue`, `Knowledge`, `Settings`
  - admin gating for non-core surfaces
  - current security, startup, recovery, and backup paths
- Rewrite justified:
  - app shell and top-level tab model
  - workspace container and frontend domain-client seam
  - pilot and analytics product-surface framing
- Rewrite not justified yet:
  - full Tauri command surface
  - DB schema
  - security and encryption core
  - search sidecar before earlier seams are stable

## 8. Parallelization via Sub-Agents / Skills

- Use `pm-delivery-hub` to keep `CODEX_AUDIT_PLAN.md` and `CODEX_IMPLEMENTATION_PLAN.md` synchronized as the planning source.
- Use `parallel-delivery-conductor` for every major batch after Batch 0.
- Use `git-workflow` on every mutating branch for branch creation, commit chunking, and PR notes.
- Use `quality-gatekeeper` on every batch before merge.
- Use `ui-shipping-hub` for Batches 1-5.
- Use `backend-reliability-hub` for Batches 6-8.
- Use `performance-budget` before and after Batches 1, 3, 5, 8, and 9.
- Use the existing audit lanes in parallel:
  - `frontend_ux_audit`: shell contraction, knowledge/admin surface consolidation, screenshot review
  - `architecture_audit`: workspace seam design, Tauri command split, DB module split
  - `test_ci_audit`: per-batch gate packs, benchmark capture, rollback posture
  - `rust_tauri_audit`: Batch 6 and 7 review lane
  - `python_service_audit`: Batch 8 review lane
  - `security_audit`: validate that shell and backend simplification do not weaken policy gates or storage boundaries
- Parallelize only where write scopes do not overlap.

## 9. Branch Strategy

- Never work on `master`. Use one branch per batch with `pnpm git:branch:create "<task>" <type>`.
- Recommended branch sequence:
  - `codex/docs/audit-source-of-truth`
  - `codex/ci/validation-guardrail-alignment`
  - `codex/refactor/canonical-shell`
  - `codex/refactor/workspace-queue-canonical`
  - `codex/refactor/knowledge-surface-consolidation`
  - `codex/refactor/admin-surface-collapse`
  - `codex/refactor/frontend-domain-seams`
  - `codex/refactor/tauri-command-domains`
  - `codex/refactor/db-domain-facade`
  - `codex/refactor/search-api-simplification`
  - `codex/chore/delete-dead-paths`
- Keep PRs atomic by runtime boundary.
- Do not stack more than one mutating branch at a time on top of unmerged structural work unless the dependent branch is read-only planning or test-only.
- For risky replacement waves, use a two-PR pattern:
  - PR A introduces the new canonical path with compatibility shims.
  - PR B removes the old path after post-merge smoke passes on `master`.
- Rebase each branch on current `master` before merge. Do not start the next destructive wave until the prior wave’s post-merge smoke passes.

## 10. First Execution Sprint

- Sprint goal: make the product shape real before any deep backend refactor.
- Scope:
  - create `CODEX_AUDIT_PLAN.md` from the approved audit
  - create `CODEX_IMPLEMENTATION_PLAN.md`
  - align docs and verify commands to the actual repo
  - make `RevampShell` the only supported shell path
  - reduce primary navigation to the intended core product tabs
  - pin workspace to the revamp path and queue to the stable legacy path until Batch 2 completes parity work
- Explicitly out of scope:
  - command or DB splitting
  - schema changes
  - search-api changes
  - deletion of old components in the same PR as shell replacement
- Deliverables:
  - one source-of-truth audit doc
  - one source-of-truth implementation plan
  - one canonical shell
  - one agreed primary nav model
  - updated screenshots and tab and shortcut tests
- Validation:
  - `.codex/verify.commands`
  - `pnpm ui:gate:regression`
  - focused tab-policy and command-palette tests
  - responsive Playwright smoke
  - screenshot evidence in PR
- Rollback note:
  - if the canonical shell causes breakage, revert the shell PR only and keep the docs and guardrail PR merged
  - do not delete legacy paths in Sprint 1
