# ADR 0013 - Release-gate dependency security refresh

## Status

Accepted

## Context

The release gate surfaced fresh dependency advisories after the shell-title
test cleanup was ready. The failing checks covered three dependency surfaces:
the JavaScript lockfile, Rust DNS/compression dependencies, and the Python
search API embedding stack.

Leaving the advisories open would keep the release branch red. Treating them
as unrelated would also make the release gate less useful, because the branch
was already exercising the dependency-health workflows.

## Decision

Keep the remediation in the release-gate cleanup branch and make the smallest
compatible updates needed for the gate to pass:

- Regenerate the pnpm lockfile with the same pnpm version used by CI.
- Upgrade `hickory-resolver` to the fixed 0.26 line and adapt the DNS resolver
  wrapper to the renamed Tokio resolver API.
- Update the vulnerable `lz4_flex` transitive dependency through `Cargo.lock`.
- Keep temporary Rust audit waivers only for upstream warning-class transitives
  that do not currently have direct application-level fixes.
- Upgrade the Python embedding stack to compatible current versions of
  `huggingface-hub`, `sentence-transformers`, and `transformers`.

## Consequences

The dependency gate becomes current again without changing intended product
behavior. The DNS wrapper now follows the newer Hickory resolver construction
API, and the Python search API will resolve a newer embedding stack in CI.

The remaining Rust audit waivers still need periodic review through the
existing dependency-advisory process. They are documented in the audit script
instead of being hidden in CI configuration.

## Alternatives Considered

Split the dependency work into separate follow-up PRs. Rejected because the
current PR was already blocked by release-gate security checks, and keeping
the gate red would leave the branch unmergeable.

Disable or weaken the failing checks. Rejected because the checks caught real
dependency drift and should remain authoritative.
