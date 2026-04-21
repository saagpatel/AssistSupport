## Definition of Done (Git + Performance)

<!-- comm-contract:start -->

## Communication Contract (Global)

- Follow `/Users/d/.codex/policies/communication/BigPictureReportingV1.md` for all user-facing updates.
- Use exact section labels from `BigPictureReportingV1.md` for default status/progress updates.
- Keep default updates beginner-friendly, big-picture, and low-noise.
- Keep technical details in internal artifacts unless explicitly requested by the user.
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
6. Performance checks required before release health is considered done:
   - bundle delta
   - build time delta
   - Lighthouse budgets
   - API latency thresholds
   - DB query health checks
   - asset-size checks
7. Core repo health must be green for normal development work; release health must be green before calling release validation done.
8. Any required gate in `fail` or `not-run` blocks completion for the relevant health tier.

## UI Hard Gates (Required for frontend/UI changes)

1. Read-only reviewer agent must output `UIFindingV1[]`.
2. Fixer agent must apply findings in severity order: `P0 -> P1 -> P2 -> P3`.
3. Required states per changed UI surface: loading, empty, error, success, disabled, focus-visible.
4. Required core repo health gates:
   - eslint + typecheck + stylelint
   - smoke lane
   - visual regression (Playwright snapshots)
   - accessibility regression (axe)
   - responsive parity checks (mobile + desktop)
5. Required release health gates:
   - Lighthouse CI thresholds
6. Done-state is blocked if any required gate in the active health tier is `fail` or `not-run`.

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
- Required checks are blocking when `fail` or `not-run`: lint, typecheck, tests, diff coverage, docs check.
- Reviewer -> fixer -> reviewer loop is required before merge.
