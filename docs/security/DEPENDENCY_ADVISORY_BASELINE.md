# Dependency Advisory Baseline

Date: 2026-07-13
Default branch snapshot: pending merge of `codex/fix/assistsupport-lru-advisory`

## Purpose

This file is the baseline referenced by `.github/workflows/dependency-watch.yml`.
It records known advisory state, active remediation PRs, and temporary exceptions.

## Current Baseline

### JavaScript (`pnpm audit`)

- Status on `master`: advisories present (2 moderate, 1 low)
- Modules observed:
  - `ajv` (moderate)
  - `lodash` (moderate)
  - `tmp` (low)
- Remediation PR: `#24` (`codex/fix/deps-ajv-6-14-0`)

### Python (`pip-audit -r search-api/requirements.txt`)

- Status on `master`: advisory present
- Module observed:
  - `flask==3.1.2` (`CVE-2026-27205`, fixed in `3.1.3`)
- Remediation PR: `#25` (`codex/fix/deps-flask-3-1-3`)

### Rust (`pnpm run test:security:audit:rust`)

- Status: passing with explicit temporary waivers
- Waiver source: `scripts/security/run-cargo-audit.sh`
- Owner: Platform Engineering
- Tracking issues:
  - Umbrella: `#11`
  - Child: `#12`, `#13`, `#14`, `#15`, `#17`
- Current remediation update:
  - `lancedb` upgraded to `0.30.0`, removing vulnerable `lru`.
  - `rand` resolved to patched `0.8.6`.
  - `quinn-proto`, `anyhow`, and `memmap2` patch updates applied for newly published RustSec advisories.
  - `calamine` is upgraded to `0.36.0` and `plist` to `1.10.0`; both runtime XML paths now use patched `quick-xml 0.41.0`.
  - `quick-xml` advisories `RUSTSEC-2026-0194` and `RUSTSEC-2026-0195` remain temporarily waived only for `wayland-scanner`'s trusted build-time protocol XML generator.
  - Waiver owner: Platform Engineering; tracking issue: `#178`; review deadline: 2026-08-10 or the first `wayland-scanner` release using `quick-xml >=0.41.0`.

## Exit Criteria to Update Baseline

1. Dependency remediation PR merges to `master`.
2. Post-merge audit lane confirms resolved advisory is absent.
3. This file is updated with new baseline date/SHA and residual advisories only.

## Policy

- Dependabot PRs are intake signals and may be superseded by codex-compliant branches.
- Any temporary Rust waiver must include owner, issue, expiry, and rationale.
