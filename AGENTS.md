## Definition of Done (Git + Performance)

<!-- comm-contract:start -->
## Communication Contract (Global)
- Follow `/Users/d/.codex/policies/communication/BigPictureReportingV1.md` for all user-facing updates.
- Use exact section labels from `BigPictureReportingV1.md` for formal delivery, blocker, waiting, risk, decision, or explicit status/report requests.
- Keep ordinary in-flight updates conversational, warm, PM-readable, operator-grade, and low-noise.
- Keep technical details in internal artifacts unless explicitly requested by the user or required by failure, risk, or verification.
- Honor toggles literally: `simple mode`, `show receipts`, `tech mode`, `debug mode`.
<!-- comm-contract:end -->
1. Every task runs on a non-main branch named `codex/<type>/<slug>`.
2. Never commit directly to `main` or `master`.
3. Commits must be atomic and follow Conventional Commits.
4. Before finalizing each logical commit, run reviewer/fixer loop:
   - Run read-only reviewer.
   - Apply accepted findings with fixer in severity order.
   - Re-run reviewer until no P0/P1 findings remain.
5. PR description must include:
   - What/Why/How/Testing/Risks
   - Performance impact section
   - Lockfile rationale when lockfiles changed
   - Screenshots for UI changes
6. Performance checks required before done:
   - bundle delta
   - build time delta
   - Lighthouse budgets
   - API latency thresholds
   - DB query health checks
   - asset-size checks
7. Any required gate in `fail` or `not-run` blocks completion.

## UI Hard Gates (Required for frontend/UI changes)

1. Read-only reviewer agent must output `UIFindingV1[]`.
2. Fixer agent must apply findings in severity order: `P0 -> P1 -> P2 -> P3`.
3. Required states per changed UI surface: loading, empty, error, success, disabled, focus-visible.
4. Required pre-done gates:
   - eslint + typecheck + stylelint
   - visual regression (Playwright snapshots)
   - accessibility regression (axe)
   - responsive parity checks (mobile + desktop)
   - Lighthouse CI thresholds
5. Done-state is blocked if any required gate is `fail` or `not-run`.

## Definition of Done: Tests + Docs (Blocking)

- Any production code change must include meaningful test updates in the same PR.
- Meaningful tests must include at least:
  - one primary behavior assertion
  - two non-happy-path assertions (edge, boundary, invalid input, or failure mode)
- Trivial assertions are forbidden (`expect(true).toBe(true)`, snapshot-only without semantic assertions, render-only smoke tests without behavior checks).
- Mock only external boundaries (network, clock, randomness, third-party SDKs). Do not mock the unit under test.
- UI changes must cover state matrix: loading, empty, error, success, disabled, focus-visible.
- API/command surface changes must update generated contract artifacts and request/response examples.
- Architecture-impacting changes must include an ADR in `/docs/adr/`.
- Required checks are blocking when `fail` or `not-run`: lint, typecheck, tests, coverage, diff coverage, docs check.
- Reviewer -> fixer -> reviewer loop is required before merge.

<!-- portfolio-context:start -->
# Portfolio Context

## What This Project Is

AssistSupport is a local-first macOS support-assistant app. It combines a Tauri desktop shell, local encrypted storage, intent classification, TF-IDF retrieval, cross-encoder reranking, and optional local LLM inference to draft grounded IT support answers from an operator-owned knowledge base.

## Current State

The repo is active product work. The README describes the intended support workflow, core search pipeline, and local privacy posture. Current local changes include unrelated dependency-lock work, so recovery edits should stay limited to documentation context unless the active branch owner explicitly broadens scope.

## Stack

| Layer         | Technology                                          |
| ------------- | --------------------------------------------------- |
| Desktop shell | Tauri 2 + Rust                                      |
| Frontend      | React + TypeScript + Vite                           |
| ML search     | TF-IDF, Logistic Regression, ms-marco-MiniLM-L-6-v2 |
| Local storage | SQLite (encrypted)                                  |
| LLM inference | Local via Ollama (optional)                         |
| Fonts         | IBM Plex Sans, JetBrains Mono                       |

## How To Run

- Install dependencies with `pnpm install`.
- Run the desktop development loop with `pnpm dev`.
- Build the Tauri app with `pnpm tauri build`.
- Run the repo's required lint, typecheck, test, coverage, diff coverage, and docs gates before shipping behavior changes.

## Known Risks

- Core workspace data and token material must remain local and encrypted at rest.
- Optional vector-search embeddings are local but not currently encrypted at rest when vector search is enabled.
- Do not route support queries or KB contents to cloud inference unless a future design explicitly changes the privacy contract.
- Preserve the reviewer -> fixer -> reviewer loop and ADR requirement for architecture-impacting changes.

## Next Recommended Move

Stabilize the active dependency-lock work on the existing branch, then run the repo health gates before any release or security claim.

<!-- portfolio-context:end -->
