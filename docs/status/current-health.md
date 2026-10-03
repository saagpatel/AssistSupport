# Current Health

Last audited: June 7, 2026

AssistSupport uses two health tiers so the repo can be honest about what is green today and what only applies during release work.

## Core Repo Health

Use this for normal development and PR confidence:

```bash
pnpm health:repo
```

Core repo health is blocking for regular engineering work and includes:

- branch, workflow, and version sanity checks
- workstation preflight
- ESLint, TypeScript typecheck, and Stylelint
- frontend unit tests
- Search API tests
- Rust backend and security regression tests
- Playwright smoke, visual, accessibility, and responsive checks

## Release Health

Use this when validating release readiness:

```bash
pnpm health:release
```

Release health runs core repo health plus:

- frontend coverage generation for diff-coverage workflows
- build-time, bundle-size, asset-size, memory, and Lighthouse budgets
- optional API latency and DB query health checks when release environment variables are configured

Release-only prerequisites:

- set `BASE_URL` to enable API latency checks
- set `DATABASE_URL` to enable DB query health checks

Run from the repository root after the locked `pnpm install --frozen-lockfile` setup. These variables can be inherited from the shell: inspect the target before running `health:release`. To omit those two live benchmark lanes during local verification, explicitly remove those variables with `env -u BASE_URL -u DATABASE_URL pnpm health:release`; the two capability lanes are then skipped, not passed. Enable them only for an authorized disposable endpoint/database with synthetic data. The API benchmark performs readiness GETs and repeated search POSTs and can send `AUTH_TOKEN`; the DB lane connects to the supplied database and may run `CREATE EXTENSION IF NOT EXISTS pg_stat_statements`, which changes database state. Never use personal or production services merely to verify documentation. Required release capability checks still need their own evidence.

For a focused frontend change, `pnpm test src/features/workspace/workspacePerformance.test.ts` runs the checked-in logic fixtures. Broader frontend tests use `pnpm test`; required core gates remain `pnpm health:repo`. The [README core commands](../../README.md#core-commands) list the static and backend lanes. Search API prerequisites are in [search-api/README.md](../../search-api/README.md). UI changes require the existing Playwright smoke/visual/accessibility/responsive lanes: `pnpm ui:gate:regression` starts its own local Vite server with mocked Tauri IPC, and requires Playwright Chromium. This is browser fixture coverage, not proof of native integrations. Pure documentation edits do not require an interactive browser check.

## Advisory And Supporting Gates

These still matter, but they are not the single daily health command:

- diff coverage remains the enforced coverage model in CI
- PR policy checks still require tests/docs coverage for changed surfaces
- lockfile rationale, branch naming, commit hygiene, and secret scanning stay enforced through supporting workflows
- overall line coverage is informational; it is not the primary health target

## Sanitized Demo Readiness

The sanitized demo lane is merged and ready to restart from `master`.

- Demo plan: [docs/demo/sanitized-demo-plan.md](../demo/sanitized-demo-plan.md)
- Latest rehearsal snapshot: [docs/demo/rehearsal-snapshot.md](../demo/rehearsal-snapshot.md)
- Portfolio demo handoff: [docs/demo/portfolio-handoff-bundle.md](../demo/portfolio-handoff-bundle.md)
- Fictional tenant: Northstar Labs with `.example` domains and `NSD-*` ticket IDs
- Safe demo sources: checked-in `knowledge_base/`, mock Tauri IPC data, and portfolio collateral under `docs/screenshots/`, `docs/one-pager/`, and `docs/deck/`
- Unsafe sources: `.env*`, private workspace data, Redis dumps, real customer exports, and real integration credentials
- Expected local state: no auxiliary worktrees, only `master` checked out, and no ignored demo/runtime artifacts required in the workspace

Restart note: begin future demo or portfolio work from current `origin/master`, rerun the verification checklist in the sanitized demo plan before presenting, and keep generated PPTX/contact-sheet HTML/Redis dump files out of commits.
