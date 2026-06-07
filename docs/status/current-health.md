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

## Advisory And Supporting Gates

These still matter, but they are not the single daily health command:

- diff coverage remains the enforced coverage model in CI
- PR policy checks still require tests/docs coverage for changed surfaces
- lockfile rationale, branch naming, commit hygiene, and secret scanning stay enforced through supporting workflows
- overall line coverage is informational; it is not the primary health target

## Sanitized Demo Readiness

The sanitized demo lane is merged and ready to restart from `master`.

- Demo plan: [docs/demo/sanitized-demo-plan.md](../demo/sanitized-demo-plan.md)
- Fictional tenant: Northstar Labs with `.example` domains and `NSD-*` ticket IDs
- Safe demo sources: checked-in `knowledge_base/`, mock Tauri IPC data, and portfolio collateral under `docs/screenshots/`, `docs/one-pager/`, and `docs/deck/`
- Unsafe sources: `.env*`, private workspace data, Redis dumps, real customer exports, and real integration credentials
- Expected local state: no auxiliary worktrees, only `master` checked out, and no ignored demo/runtime artifacts required in the workspace

Restart note: begin future demo or portfolio work from current `origin/master`, rerun the verification checklist in the sanitized demo plan before presenting, and keep generated PPTX/contact-sheet HTML/Redis dump files out of commits.
