# 0013. Security Alert Dependency Overrides

## Status

Accepted

## Context

Dependabot and audit checks reported high-severity transitive dependency alerts
in JavaScript tooling packages and Rust networking or TLS crates. The affected
JavaScript packages are not direct runtime dependencies, but they still run in
developer and CI workflows. The Rust alerts sit on security-sensitive TLS and DNS
resolution paths.

## Decision

Use scoped package-manager overrides for patched JavaScript transitive versions,
and update the Rust lockfile for patched `openssl` and `hickory` dependency
versions. Keep the hickory resolver API migration local to the pinned DNS
resolver so the SSRF protection boundary stays unchanged.

## Consequences

High-severity JavaScript audit output is cleared while preserving the existing
toolchain shape. Rust TLS and DNS dependency versions move forward with a small
API compatibility update. The remaining moderate audit items are left visible
for a separate pass instead of widening this remediation.

## Alternatives Considered

Directly upgrading parent tools such as Lighthouse, Commitizen, and Stylelint
would touch more of the frontend toolchain than needed for this security slice.
Suppressing the alerts was rejected because patched versions are available for
the high-severity items handled here.
