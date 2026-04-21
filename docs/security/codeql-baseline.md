# CodeQL Baseline

> **Stub — 2026-04-21.** Populated on first successful CodeQL run after
> `.github/workflows/codeql.yml` lands on master. Until then this file
> reserves the documentation slot referenced by the Wave 3 plan.

## Purpose

CodeQL (SAST) runs against both the TypeScript/JavaScript surface in
[src/](../../src/) and the Rust surface in [src-tauri/](../../src-tauri/)
on every push to master, every PR, and weekly (Sunday 03:00 UTC).

The first full run establishes a baseline that all future PRs are
compared against. Baseline findings are not a merge blocker — they
document the current state so a PR that _introduces_ a new CodeQL
warning is easy to spot.

## Baseline Snapshot

| Language              | High | Medium | Low | Notes                     |
| --------------------- | ---- | ------ | --- | ------------------------- |
| javascript-typescript | TBD  | TBD    | TBD | Populated after first run |
| rust                  | TBD  | TBD    | TBD | Populated after first run |

## Policy

- **High severity:** zero tolerance. A PR that introduces a high-severity
  CodeQL finding must resolve it before merge, or file an exception with
  an owner and a two-week review date in the PR description.
- **Medium severity:** triaged weekly from the dependency-watch alert
  issue. Aim to reduce the baseline rather than let it grow.
- **Low severity:** informational. Fix opportunistically when touching
  the file.

## Related

- [.github/workflows/codeql.yml](../../.github/workflows/codeql.yml)
- [.github/workflows/osv-scan.yml](../../.github/workflows/osv-scan.yml)
- [.github/workflows/dependency-watch.yml](../../.github/workflows/dependency-watch.yml)
- [docs/runbooks/dependency-advisory-triage.md](../runbooks/dependency-advisory-triage.md)
