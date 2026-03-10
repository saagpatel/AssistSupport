# AssistSupport Product Improvement Program

## Summary
- Objective: turn AssistSupport from a strong local drafting/search tool into a full daily support-engineer workspace centered on ticket resolution, knowledge reuse, guided action, queue operations, and clean handoffs.
- Plan Mode note: this turn is read-only, so the first execution step after leaving Plan Mode is to write this plan verbatim to `docs/plans/product-improvements-roadmap.md`. That file becomes the canonical execution document. Every PR updates the same file with status, discoveries, deviations, decisions, links to PRs, screenshots, and phase-close evidence. After every compaction, reread that file first.
- Product defaults locked now: primary user is an IT support engineer handling tickets; secondary user is a team lead. The app remains local-first. External dispatches are preview-first and user-confirmed. No silent writes into Jira, Slack, Teams, or ServiceNow. `drafts` remain the primary work record in v1; do not create a separate `tickets` table in this program.
- Methodology anchors from official sources: Atlassian incident guidance emphasizes centralized context, explicit roles, runbooks, and handoffs; KCS emphasizes capture in the workflow, structure for reuse, search-first reuse, and “reuse is review”; Microsoft, Zendesk, and ServiceNow all emphasize in-context summaries, knowledge, and next-best guidance inside the agent workspace. Sources: [Atlassian incident roles](https://www.atlassian.com/incident-management/incident-response/roles-responsibilities), [Atlassian incident response](https://www.atlassian.com/incident-management/incident-response), [Atlassian KCS](https://www.atlassian.com/itsm/knowledge-management/kcs), [Consortium for Service Innovation: Solve Loop](https://library.serviceinnovation.org/KCS/KCS_v6/KCS_v6_Practices_Guide/030/030), [Consortium: Capture](https://library.serviceinnovation.org/KCS/KCS_v6/KCS_v6_Practices_Guide/030/030/010), [Consortium: Reuse is Review](https://library.serviceinnovation.org/KCS/KCS_v6/KCS_v6_Practices_Guide/030/030/040/020), [Consortium: Adopt in Waves](https://library.serviceinnovation.org/KCS/KCS_v6/Measurement_Matters_v6/74_Adopt_in_Waves), [Microsoft case and conversation summaries](https://learn.microsoft.com/en-us/dynamics365/customer-service/cs-ai-generated-summary), [Microsoft Ask a Question](https://learn.microsoft.com/en-us/dynamics365/contact-center/use/use-ask-a-question), [Zendesk knowledge in context](https://www.zendesk.com/service/help-center/knowledge-agent-workspace/). The exact feature sequencing below is an inference based on the repo’s current architecture.
- Delivery model: use `pm-delivery-hub` to manage milestone plans and the canonical roadmap file; `parallel-delivery-conductor` to split each phase into planner, designer, builder, QA, and release lanes; `ui-shipping-hub` for workspace and queue surfaces; `backend-reliability-hub` for Tauri/search-api/db changes; `docs-knowledge-hub` for roadmap, ADRs, and runbooks; `quality-gatekeeper` and `qa-release-gate-orchestrator` to block phase close; `performance-budget` to enforce bundle/build/Lighthouse/API/DB budgets; `playwright` for UI and a11y evidence. Use sub-agents in every phase: planner for scope locking, designer for UX spec, builder for implementation slices, QA for regression, release for go/no-go.

## Phase 0 — Canonical Plan, Measurement, and Contract Lock
- Goal: create the durable execution record, lock product defaults, and baseline success metrics before feature work starts.
- Build:
  1. Create `docs/plans/product-improvements-roadmap.md` from this plan.
  2. Add required sections to that file: `Status Ledger`, `Locked Decisions`, `Open Risks`, `Metric Baselines`, `Phase Checklists`, `Discoveries`, `Deviations`, `PR Index`, and `Post-Launch Learnings`.
  3. Add a short pointer from `docs/plans/current-remediation-plan.md` to the new roadmap file so future sessions find the right canonical document quickly.
  4. Instrument baseline metrics using the existing analytics/event system: time to first usable draft, edit ratio before send, KB source reuse rate, handoff completion rate, similar-case clickthrough, queue triage throughput, next-action acceptance, and KB promotion rate.
  5. Lock feature flags now: `ticket_workspace_v2`, `structured_intake`, `similar_cases`, `next_best_action`, `guided_runbooks_v2`, `policy_approval_assistant`, `batch_triage`, `collaboration_dispatch`, `workspace_command_palette`.
- Success criteria:
  1. The canonical roadmap file exists and is the only execution source of truth.
  2. Every later phase has a measurable baseline and an owner lane.
  3. No implementer has to decide whether to create a new ticket domain model, whether cloud services are required, or whether outbound integrations are silent or previewed.

## Phase 1 — Ticket Workspace Foundation
- Goal: replace the current tab-hopping workflow with a single ticket-centered workspace.
- Build:
  1. Create a `Ticket Workspace` surface on top of the existing workspace shell in `src/features/workspace/*`, `src/components/Draft/*`, and `src/features/revamp/screens/QueueCommandCenterPage.tsx`.
  2. Keep `SavedDraft` as the canonical work unit. Formalize the existing `case_intake_json` and `handoff_summary` into typed frontend/backend contracts instead of opaque strings.
  3. Add a `Structured Intake` panel that produces a normalized case summary with: issue, environment, impact, urgency, affected user/system/site, symptoms, steps already tried, blockers, likely category, and missing data.
  4. Add intake presets for incident, access request, change/rollout, and device/user/environment troubleshooting. These replace ad hoc note scaffolding.
  5. Add note audience modes across the workspace: `customer-safe`, `internal note`, and `escalation note`. Default to `internal note` for workspace drafting and require deliberate switch for customer-safe output.
  6. Add a first-class handoff pack generator that produces summary, actions taken, current blocker, next recommended step, and customer-safe update. Use the existing draft handoff fields as the seed, but switch to a typed pack contract.
  7. Add a right-rail workspace layout with ticket context, KB sources, suggested actions, and handoff status visible without tab switching.
- Skills and sub-agents:
  1. Use `ui-shipping-hub` plus designer and design-critic lanes for the workspace IA and state design.
  2. Use `backend-reliability-hub` plus builder lane to formalize intake and handoff contracts.
  3. Use `playwright` plus QA lane for keyboard, focus, and responsive parity.
- Success criteria:
  1. An engineer can open one ticket and stay in one workspace to intake, draft, annotate, and prepare a handoff.
  2. Structured intake and handoff data round-trip through typed contracts.
  3. Loading, empty, error, success, disabled, and focus-visible states exist on every new workspace surface.

## Phase 2 — Case Memory, Knowledge Reuse, and the KCS Loop
- Goal: make previously solved work and knowledge-base improvement part of the normal support workflow.
- Build:
  1. Add `Similar Solved Cases` to the workspace. Search over finalized drafts, handoff packs, saved responses, and KB-linked outcomes. Do not require vector search to be enabled; use lexical/metadata retrieval first and boost with vectors when available.
  2. Add result explainability for both KB results and similar cases: why this match surfaced, what fields matched, whether policy boost or prior reuse affected ranking, and whether the result is authoritative.
  3. Add `Promote to KB Draft` from a resolved workspace. It should generate a KB draft with title, symptoms, environment, cause, resolution, warnings, prerequisites, policy links, and reusable tags.
  4. Add `Resolution Kits`: reusable bundles of response template, KB articles, runbook template, approval pattern, and checklist for recurring issue families.
  5. Add `Compare to Last Successful Resolution` so the engineer can diff the current draft against the closest resolved case or saved response.
  6. Add `Favorites` for runbooks, policies, KB paths, and kits. Store favorites locally and surface them in the workspace and command palette.
- Skills and sub-agents:
  1. Use `docs-knowledge-hub` to define the KB draft template and content standard.
  2. Use `backend-reliability-hub` for similar-case retrieval, ranking, and stored artifact contracts.
  3. Use planner and builder lanes to keep similar-case retrieval independent of optional vector search.
- Success criteria:
  1. A resolved ticket can produce a KB draft without leaving the workspace.
  2. Similar cases surface with explainability and at least one reuse action: open, compare, or reuse parts.
  3. Resolution kits and favorites are usable from the workspace without forcing a new navigation pattern.

## Phase 3 — Guided Resolution Intelligence
- Goal: move from “draft generation” to “decision support.”
- Build:
  1. Add `Next Best Action` recommendations that return ranked actions such as answer, ask clarifying questions, run a guided runbook, escalate, request approval, or create/update KB. Each action must include rationale, confidence, and required prerequisites.
  2. Implement the action engine as rules-first plus model-assisted. Rules cover policy detection, missing intake fields, SLA/queue risk, runbook triggers, and approval requirements. Model assistance is allowed to rank and phrase suggestions, but cannot override hard policy or safety rules.
  3. Add `Missing Questions to Ask` as a distinct output, not a side effect of general drafting. It should surface the minimum missing information needed to proceed.
  4. Upgrade runbook sessions in `src/components/Ops/OpsTab.tsx` and related feature ops hooks into `Guided Runbooks` with branches, required evidence, skip reasons, failure states, and “copy step results into internal note.”
  5. Add a `Policy and Approval Assistant` that searches authoritative policy content first, identifies whether the request is allowed, required approvers, required evidence, and the recommended compliant response. Never generate workaround suggestions when policy forbids the request.
  6. Add `Evidence Pack` preview and export. An evidence pack includes structured intake, KB sources, relevant screenshots/OCR, actions taken, runbook evidence, and escalation summary.
- Skills and sub-agents:
  1. Use `backend-reliability-hub` plus security-oriented builder/QA lanes for the rule engine and policy guarantees.
  2. Use `ui-shipping-hub` for action cards, runbook flows, and evidence preview UX.
  3. Use `quality-gatekeeper` to block merge if rules-first invariants are not covered by tests.
- Success criteria:
  1. Every recommendation is explainable and auditable.
  2. Missing-data and policy-blocked cases route to clarify or deny instead of generating unsafe answers.
  3. Runbooks can be executed inside the workspace and export evidence into the handoff/escalation pack.

## Phase 4 — Queue Operations, Coaching, and Collaboration
- Goal: improve the entire queue, not just one ticket.
- Build:
  1. Add `Batch Triage` to the queue command center so engineers can paste or import many tickets and get structured summaries, likely categories, urgency estimates, and recommended owners/actions in one pass.
  2. Expand queue analytics into `Queue Coaching` and `Team Scorecards`: recurring issue clusters, high-edit tickets, low-confidence issue families, missing-KB hotspots, long-handling patterns, and runbook opportunities.
  3. Add `Shift Handoff` and `Escalation Packs` at queue level so a lead can generate a shift summary with open risk, top at-risk items, owner workload, blockers, and next-shift focus.
  4. Add collaboration actions for Jira, ServiceNow, Slack, and Teams using the existing integration foundations. Version 1 is preview-first: show the exact payload, require explicit confirmation, store dispatch history, and allow retry/cancel before send.
  5. Add queue-level filters for policy-heavy tickets, approval-heavy tickets, repeated incidents, and missing-context tickets so triage leads can route work intentionally.
- Skills and sub-agents:
  1. Use `parallel-delivery-conductor` to split queue UX, integration payloads, and analytics work into separate lanes.
  2. Use `backend-reliability-hub` for dispatch history, auditability, and integration safety.
  3. Use `docs-knowledge-hub` for operator runbooks and shift-handoff templates.
- Success criteria:
  1. A support lead can triage a queue, generate a shift handoff, and prepare external escalations without manual copy-paste assembly.
  2. External dispatch is always explicit, previewed, and logged.
  3. Coaching metrics are actionable and tied to reusable remediation paths such as kits, KB drafts, and runbooks.

## Phase 5 — Productivity, Polish, and Premium Daily Use
- Goal: make the app feel like the support engineer’s fastest daily tool.
- Build:
  1. Add a `Workspace Command Palette` with ticket-aware actions: open similar cases, switch note mode, run best next action, start runbook, generate handoff, export evidence, promote KB draft, dispatch escalation.
  2. Add narrow-window and responsive optimization for workspace, queue, and runbook views. The target is not a separate mobile product; it is reliable laptop-side-by-side use and small-window desktop use.
  3. Add macro and template upgrades so kits, favorites, and prior successful phrasing can be inserted with fewer clicks.
  4. Add a “compare current draft vs last successful resolution” fast action directly from the workspace header.
  5. Add lightweight personalization defaults: preferred note audience, favorite queues, favorite kits, preferred output length, and default evidence-pack format.
  6. Tune performance: workspace initial render, similar-case lookup latency, action-recommendation latency, batch triage throughput, and export speed.
- Skills and sub-agents:
  1. Use `ui-shipping-hub`, `playwright`, and designer/QA lanes for the premium workflow polish.
  2. Use `performance-budget` to keep bundle, render, and API/query budgets inside target.
  3. Use `qa-release-gate-orchestrator` to close the phase with a real go/no-go.
- Success criteria:
  1. The common daily workflow can be driven mostly from one workspace and a command palette.
  2. Narrow-window use is first-class.
  3. Performance and UX quality stay inside the existing repo’s blocking gates.

## Public Interfaces, Types, and Data Contracts
- Keep the core unit of work as `SavedDraft`; extend it with typed accessors rather than replacing it.
- Add typed models for: `CaseIntake`, `TicketWorkspaceSnapshot`, `SimilarCase`, `SearchExplanation`, `NextActionRecommendation`, `MissingQuestion`, `HandoffPack`, `EscalationPack`, `EvidencePack`, `KbDraft`, `ResolutionKit`, `GuidedRunbookTemplate`, `GuidedRunbookSession`, `ApprovalGuidance`, `CollaborationDispatchPreview`, and `WorkspaceFavorite`.
- Add or formalize Tauri commands for: `load_ticket_workspace`, `analyze_case_intake`, `find_similar_cases`, `get_search_explanation`, `recommend_next_actions`, `generate_handoff_pack`, `generate_escalation_pack`, `create_kb_draft_from_resolution`, `list_resolution_kits`, `save_resolution_kit`, `start_guided_runbook`, `advance_guided_runbook_step`, `preview_evidence_pack`, `export_evidence_pack`, `preview_collaboration_dispatch`, and `send_collaboration_dispatch`.
- Extend the existing search response contract rather than creating a separate explanation endpoint in v1. Add optional explanation fields to the current response shape.
- Add additive DB storage only where queryability matters. New tables should be: `runbook_templates`, `runbook_step_evidence`, `resolution_kits`, `workspace_favorites`, `dispatch_history`, and `case_outcomes`. Store transient or generated summaries as JSON blobs associated with drafts unless query pressure later proves otherwise.
- Keep all new migrations additive and rollback-safe. Existing drafts and old workspaces must still open with null-safe defaults.

## Test Plan and Acceptance Scenarios
- Every production code change must ship with one primary behavior test and at least two non-happy-path tests.
- Phase 1 scenarios: create structured intake from raw ticket text and Jira context; fail safely when Jira is unavailable; preserve internal/customer-safe note separation; generate a handoff pack when data is incomplete.
- Phase 2 scenarios: find similar solved cases with and without vector search enabled; explain why a match surfaced; promote a resolved case into a KB draft; handle no-match and low-confidence-match states.
- Phase 3 scenarios: recommend next actions from a well-formed ticket; switch to clarify when critical fields are missing; deny or route approval-required cases correctly; branch a runbook, attach evidence, and export an evidence pack.
- Phase 4 scenarios: batch-triage 25 tickets; queue handoff summary generation; preview and cancel a Slack/Jira/ServiceNow/Teams dispatch; block send when integration config is missing or payload validation fails.
- Phase 5 scenarios: command palette actions from keyboard only; narrow-window layout on desktop; compare-to-last-resolution flow; favorite recall and persistence.
- Required UI quality gates for every changed surface: loading, empty, error, success, disabled, and focus-visible states; axe checks; keyboard-only flows; visual regression; responsive parity.
- Required backend/reliability gates: Rust tests, Python tests, contract validation, migration safety, no panic-on-expected-failure, query health checks, export/import safety where touched.
- Required performance defaults: workspace initial render under 1.5s on seeded local data, similar-case retrieval p95 under 200ms without model generation, next-action recommendation under 2s with warmed local model, batch triage of 25 pasted tickets under 20s, and no bundle/build regression beyond existing repo budgets.
- Phase close is blocked if required gates are fail or not-run.

## Assumptions and Defaults
- New roadmap file path: `docs/plans/product-improvements-roadmap.md`.
- Old remediation plan remains historical; it gets a pointer, not a merge.
- Rollout model: adopt in waves. Internal dogfood first, then support lead pilot, then broader operator rollout, matching KCS adoption guidance.
- No new cloud dependency is introduced by this program. All intelligence remains compatible with the current local-first posture.
- Similar solved cases must work even when vector search is disabled.
- Next Best Action is advisory, not autonomous. The engineer remains the final actor.
- External dispatch integrations are default-off until configured and are always preview-first.
- Search explainability is added to the current search contract, not a brand-new service surface.
- Workspace v1 of this program is built on top of the current draft/workspace model, not a new ticketing backend.
- The first implementation mutation after leaving Plan Mode is to write this plan to the canonical roadmap file exactly as described above and then reread that file before any implementation work starts.

## Status Ledger
- 2026-03-10: Roadmap file created from the approved plan. This is now the canonical execution document for product improvement work.
- 2026-03-10: Phase 0 foundations landed. The roadmap file was made canonical, the remediation plan now points here, the feature flags were defined in `src/features/revamp/flags.ts`, and event instrumentation was added for intake, similar-case open, next-action acceptance, handoff copy, evidence copy, KB promotion, resolution kit save/apply, guided runbook start/progress, and queue batch triage.
- 2026-03-10: Phase 1 workspace foundation landed. The Draft experience now includes a ticket-centered workspace rail, structured intake, note-audience modes, typed case-intake persistence, typed handoff-pack generation, and a right-rail layout that keeps ticket context, suggested actions, and handoff state visible without tab switching.
- 2026-03-10: Phase 2 knowledge reuse landed. Similar solved cases, explainability, KB draft promotion, reusable resolution kits, favorites, and compare-to-last-resolution flows are present in the workspace and backed by additive storage/contracts.
- 2026-03-10: Phase 3 guided resolution landed. Next Best Action, missing questions, guided runbook sessions, evidence-pack generation, approval/policy guidance, and workspace evidence persistence are implemented. Runbook session scope continuity was hardened so sessions survive the first save and do not disappear when the draft ID is assigned.
- 2026-03-10: Phase 4 queue operations landed. Batch triage, queue coaching/team scorecards, queue handoff generation, escalation/dispatch previews, dispatch history, and queue focus filters are implemented. Collaboration dispatch remains preview-first and confirmation-based by design; it does not perform silent outbound writes.
- 2026-03-10: Phase 5 productivity/polish landed. The workspace command palette, personalization defaults, compare-latest shortcut, responsive shell behavior, narrow-window usability, and product-specific performance-budget validation are implemented.
- 2026-03-10: Verification evidence captured for this implementation slice:
  - `pnpm test` passed.
  - `pnpm test -- --run src/features/revamp/screens/QueueCommandCenterPage.test.tsx src/features/workspace/TicketWorkspaceRail.test.tsx src/features/app-shell/commands.test.ts` passed.
  - `cargo test -q --no-run` passed.
  - `cargo test -q test_runbook_sessions_are_scoped_to_workspace_key` passed.
  - `cargo test -q test_reassign_runbook_session_scope_moves_existing_sessions` passed.
  - `pnpm test:e2e:smoke` passed.
  - `pnpm ui:test:a11y` passed.
  - `pnpm ui:test:visual` passed.
  - `pnpm ui:gate:static` exited cleanly after lint, typecheck, and stylelint.
- 2026-03-10: Performance-budget phase closed for Phase 5 validation.
  - `pnpm perf:bundle` passed. Bundle size is `1,119,408` bytes, `+8.79%` versus baseline and inside the `10%` regression threshold.
  - `pnpm perf:build` passed. Build time is `3007ms`, `+4.41%` versus baseline and inside the `25%` regression threshold.
  - `pnpm perf:memory` passed. Heap delta is `0.0054 MB`, inside the `10 MB` threshold.
  - `pnpm perf:assets` passed.
  - `pnpm perf:db:enforce` passed via EXPLAIN fallback at `0.5ms`, inside the `120ms` threshold.
  - `pnpm perf:api` passed with `p95=22.23ms`, `p99=23.68ms`, and `0` failures against budgets of `350ms`, `700ms`, and `1%`.
  - `pnpm perf:lhci` passed for the local shell budget run, with only the existing non-blocking SEO warning (`0.82` vs `0.9`) on the desktop preview shell.
  - `pnpm perf:workspace` passed and now writes repeatable product-flow results.
  - `workspacePerformance.test.ts` recorded `similarCaseP95Ms=0.92` against a `200ms` budget and `nextActionP95Ms=0.01` against a `2000ms` budget.
  - `workspace-performance.spec.ts` recorded `workspaceReadyMs=78.4` against a `1500ms` budget and `batchTriageMs=94.75` against a `20000ms` budget.
  - `pnpm perf:summary` now includes `workspaceLogic` and `workspaceUi` results in `.perf-results/summary.json`.
- 2026-03-10: Pre-push hardening pass completed for the product-improvement branch.
  - Normalized the active canonical-plan references to repo-relative paths so the branch can be resumed cleanly from another machine.
  - Fixed the similar-case `save-and-open` confirmation path so it stops if the save attempt fails instead of replacing live workspace state anyway.
  - Hardened workspace save/autosave eligibility so structured intake, runbook evidence, and handoff-first progress count as meaningful work even when the legacy input box is blank.
  - Kept autosaves and saved drafts on separate record IDs so autosaves cannot overwrite real saved drafts.
  - Hardened guided-runbook scope migration so recovered autosaves move correctly on save and a failed reassignment no longer hides the active runbook from the open workspace.
  - Re-ran the pre-push verification stack: `pnpm git:guard:all`, `pnpm test`, `pnpm ui:gate:static`, `pnpm test:e2e:smoke`, `pnpm ui:test:a11y`, `pnpm ui:test:visual`, `pnpm perf:workspace`, `pnpm perf:summary`, and `cd src-tauri && cargo test -q --no-run` all passed.
- 2026-03-10: Late merge-blocker fixes landed after the first push review.
  - Guided-runbook state now counts as meaningful workspace progress for save/autosave eligibility, so runbook-only workflows are no longer treated as empty work.
  - When the workspace is rendering legacy `legacy:unscoped` runbook sessions, that scope now becomes the active source scope for later autosave/save migration.
  - Loading an autosave now keeps it separate from a real saved draft, so alternatives and case outcomes are not accidentally persisted against an autosave record that will later fork into a new saved draft ID.
  - Focused late-fix verification: `pnpm test -- --run src/features/workspace/workspaceDraftSession.test.ts src/features/workspace/workspaceAssistant.test.ts src/features/revamp/screens/QueueCommandCenterPage.test.tsx src/features/workspace/TicketWorkspaceRail.test.tsx src/features/app-shell/commands.test.ts`, `pnpm ui:gate:static`, `pnpm git:guard:all`, `pnpm test:e2e:smoke`, and `cd src-tauri && cargo test -q --no-run`.
- 2026-03-10: Final merge-closeout fixes completed for the workspace draft/runbook lifecycle.
  - Guided runbook draft notes now persist inside `diagnosis_json` and restore on draft load, so note-only runbook progress is no longer lost after save/reopen.
  - Explicit saves now update the existing saved draft in place instead of minting a fresh draft ID every time, which keeps alternatives, case outcomes, and runbook history attached to the same saved record.
  - Save/autosave runbook reassignment now prefers moving only the visible active session by ID when the session was actually touched in the current workspace, avoiding broad legacy-scope migrations that could pull unrelated historical sessions into the open draft.
  - Final verification for this closeout: `pnpm ui:gate:static`, `pnpm git:guard:all`, `pnpm test`, `pnpm test:e2e:smoke`, `pnpm ui:test:a11y`, `pnpm ui:test:visual`, `pnpm perf:workspace`, `pnpm perf:summary`, `cd src-tauri && cargo test -q --no-run`, and `cd src-tauri && cargo test -q test_reassign_runbook_session_by_id_moves_only_target_session`.

## Locked Decisions
- `SavedDraft` remains the primary work record in v1.
- All external collaboration sends are preview-first and user-confirmed.
- No separate `tickets` table is introduced in this program.
- The app remains local-first with no new cloud dependency required.
- Similar solved cases must still work without vector search.

## Open Risks
- Numeric product baselines are not populated yet. Event instrumentation exists, but real metric baselines still require dogfood or pilot traffic.
- Collaboration dispatch is intentionally preview-first and confirmation-based. The contract is now clearer, but it is still not a live connector that pushes to Jira, ServiceNow, Slack, or Teams.
- Similar-case quality still depends on the quality of stored draft outcomes and case-closure discipline. Retrieval is implemented, but ranking quality should be tuned with real usage data.
- No open high-severity merge blockers remain in the workspace save/autosave/runbook path after the late fix pass; remaining follow-up work is product tuning rather than release safety.

## Metric Baselines
- Instrumentation status: event hooks are present for workspace intake analysis, similar-case open, next-action acceptance, handoff copy, evidence copy, KB promotion, resolution-kit save/apply, guided runbook start/progress, and batch triage.
- Time to first usable draft: event-ready, numeric baseline pending pilot usage.
- Edit ratio before send: event-ready via existing save analytics, numeric baseline pending pilot usage.
- KB source reuse rate: partially event-ready, numeric baseline pending pilot usage.
- Handoff completion rate: event-ready, numeric baseline pending pilot usage.
- Similar-case clickthrough: event-ready, numeric baseline pending pilot usage.
- Queue triage throughput: event-ready, numeric baseline pending pilot usage.
- Next-action acceptance: event-ready, numeric baseline pending pilot usage.
- KB promotion rate: event-ready, numeric baseline pending pilot usage.

## Phase Checklists
- Phase 0
  - [x] Canonical roadmap file created
  - [x] Current remediation plan points here
  - [x] Feature flags locked in code
  - [x] Baseline metrics instrumented
- Phase 1
  - [x] Ticket workspace created
  - [x] Structured intake typed and persisted
  - [x] Note audience modes shipped
  - [x] Handoff pack generator shipped
- Phase 2
  - [x] Similar solved cases shipped
  - [x] Search/similar-case explainability shipped
  - [x] KB draft promotion shipped
  - [x] Resolution kits and favorites shipped
- Phase 3
  - [x] Next Best Action shipped
  - [x] Missing Questions workflow shipped
  - [x] Guided runbooks upgraded
  - [x] Policy/approval assistant and evidence pack shipped
- Phase 4
  - [x] Batch triage shipped
  - [x] Queue coaching and team scorecards shipped
  - [x] Queue handoff/escalation packs shipped
  - [x] Preview-first collaboration dispatch shipped
- Phase 5
  - [x] Workspace command palette shipped
  - [x] Responsive/narrow-window optimization shipped
  - [x] Productivity macros/personalization shipped
  - [x] Performance targets validated

## Discoveries
- Existing workspace, queue, handoff, runbook, policy-search, and saved-response primitives already cover a meaningful portion of the roadmap foundation.
- The Draft screen needed a true right-rail layout. A three-column minimum-width layout caused overlap at normal desktop widths once the workspace rail was introduced.
- Guided runbook sessions needed explicit workspace scoping plus first-save scope reassignment so they would not disappear when an unsaved workspace became a saved draft.
- Workspace favorites needed persisted-ID reads after upsert conflicts so the UI would not hold a phantom ID.
- The similar-case open flow needed a deliberate confirmation step when live workspace content exists; blocking with an error alone was not enough.
- Preview-first collaboration dispatch benefits from explicit “confirm sent” wording in both the UI and command contract to avoid implying a live outbound connector when the action is really a manual confirmation step.
- The response-panel scroll region needed keyboard focusability, and the workflow-strip headings needed stronger contrast to keep the new workspace surfaces accessible.
- The cleanest workspace readiness signal came from app-owned bootstrap and ready timestamps instead of depending on browser performance entries alone.
- The legacy “empty draft” rule was too narrow once structured intake, handoff packs, and guided runbook evidence became first-class workspace artifacts. Save/autosave eligibility now needs to follow meaningful workspace state, not just the raw input text box.
- Recovered autosaves behave like a separate lifecycle from saved drafts. The workspace needs to preserve that distinction all the way through autosave IDs, manual save IDs, and guided-runbook scope keys.
- Legacy runbook fallback is only safe if the workspace adopts the same scope it is rendering. Otherwise save-time migration can move the wrong session set even when the UI appears correct.
- Runbook-only progress can exist entirely in evidence and draft notes, so persistence checks have to look beyond the main freeform response box.
- Re-saving a saved draft must preserve the original draft identity; otherwise every downstream artifact link starts to drift onto superseded records.
- Single-session migration is safer than scope-wide migration once the workspace is capable of showing legacy fallback sessions that may not all belong to the current piece of work.

## Deviations
- Numeric baselines are not filled yet. Instrumentation is present, but actual baseline values still require pilot data rather than synthetic guesses.
- Collaboration dispatch kept the preview-first/manual-confirmation product default. A clearer `confirm_collaboration_dispatch` path was added for future callers, while the existing `send_collaboration_dispatch` command remains as a compatibility alias.
- The active plan files now use repo-relative references for ongoing work. Historical audit documents still contain older machine-specific absolute path references, but they are retained as archival evidence rather than the active execution path.
- The final merge-closeout fix favors a precise per-session reassignment API over the older scope-wide reassignment when the workspace can identify the active session confidently. The broader scope-based command remains for compatibility and bulk migration cases.

## PR Index
- Product improvement branch pushed as `codex/feat/product-improvement-program`.
- Late merge-blocker follow-up fix round is in progress as the final merge-to-main closeout.

## Post-Launch Learnings
- Pending first dogfood cycle.
