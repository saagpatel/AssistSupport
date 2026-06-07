# Release Runbook

Last updated: June 7, 2026

Use this runbook when preparing a release, demo handoff, or release-readiness
claim for AssistSupport. It complements `docs/status/current-health.md`, which
defines the daily and release health commands.

## Preconditions

- Work from the intended release branch and confirm branch policy with
  `pnpm git:guard:all`.
- Confirm version parity across `package.json`, `src-tauri/tauri.conf.json`,
  and `src-tauri/Cargo.toml` with `pnpm check:version-parity`.
- Confirm the release scope has matching tests, docs, and ADR coverage when the
  changed surface requires it.
- Confirm no real customer data, private workspace data, credentials, Redis
  dumps, or private integration exports are included in release or demo
  artifacts.

## Required Gates

Run the release health command before making a release-readiness claim:

```bash
pnpm health:release
```

`pnpm health:release` includes core repo health, frontend coverage generation,
build-time and bundle budgets, asset-size checks, memory checks, and Lighthouse
budgets. API latency and database query health are release-only checks that run
when `BASE_URL` and `DATABASE_URL` are configured.

When a release depends on Rust or Tauri behavior, also keep the canonical Codex
verification file current:

```bash
cat .codex/verify.commands
```

## Evidence Capture

Record the following in the PR, handoff, or release note:

- branch name and commit SHA
- `pnpm health:release` result
- any skipped release-only checks and the exact reason they were skipped
- bundle, build-time, asset, memory, and Lighthouse outcomes
- API latency and DB query outcomes when those environments are configured
- screenshot, deck, or demo artifact links when the release is demo-facing

## Signing And Notarization

Local release-readiness can prove build and bundle posture, but it does not by
itself prove production signing, notarization, distribution, or update-channel
availability. Do not claim a signed, notarized, or distributed release unless
the signing/notarization command path was run and its evidence is attached.

## Rollback

Before promoting a release, identify the last known-good commit or tag and the
artifact set that can be restored. If a release branch fails a required gate,
stop promotion and either fix forward on the same branch or roll back to the
last known-good artifact. Do not bypass failed release gates with a chat-only
waiver.

## Blocking Failures

The release is blocked when any of these are true:

- unresolved P0/P1 findings
- failing or not-run required gates
- stale generated contracts for changed API or command surfaces
- misleading privacy, encryption, signing, notarization, or release claims
- missing evidence for skipped release-only checks
- real customer data, credentials, or private operator data in artifacts
