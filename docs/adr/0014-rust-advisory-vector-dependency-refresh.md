# ADR 0014 - Rust advisory vector dependency refresh

## Status

Accepted

## Context

Dependabot flagged vulnerable Rust lockfile paths through LanceDB's vector
search stack. The vulnerable `lru` package came from the
`lancedb -> lance -> tantivy` chain. A lockfile-only update could not cross the
manifest's `lancedb = "0.26.2"` constraint.

Testing the latest `lancedb` release showed that `0.31.0` removed `lru`, but it
also introduced an additional vulnerable `quick-xml 0.26` path through
`lance-testing`. Earlier compatible releases were evaluated to avoid replacing a
low-severity alert with broader high-severity audit drift.

## Decision

Upgrade the vector dependency stack to `lancedb 0.30.0` and Arrow `58.3`.
This removes the vulnerable `lru` path while avoiding the extra
`quick-xml 0.26` path introduced by `lancedb 0.31.0`.

Keep the LanceDB call-site change limited to the new `Scannable` contract by
passing a boxed `RecordBatchReader + Send`.

Patch related Rust advisory drift in the same lockfile refresh:

- `quinn-proto` to `0.11.15`
- `anyhow` to `1.0.103`
- `memmap2` to `0.9.11`
- Tauri utility/plugin crates far enough to remove the stale `rand 0.7.3`
  build-time path

Temporarily waive `RUSTSEC-2026-0194` and `RUSTSEC-2026-0195` for existing
`quick-xml` paths constrained by `calamine` and Tauri/plist. Keep the waiver in
`scripts/security/run-cargo-audit.sh`, not in workflow configuration, so the
exception remains visible to maintainers.

## Consequences

The Rust security gate remains blocking and current while the resolved
Dependabot paths are removed from the lockfile. The vector store continues to
use the same table schema and data flow, with only the LanceDB reader interface
adapted.

The remaining `glib` and `quick-xml` advisories are upstream-constrained and
must stay on the dependency-advisory review list until their dependency chains
allow patched versions.

## Alternatives Considered

Use `lancedb 0.31.0`. Rejected because it removed `lru` but added another
vulnerable `quick-xml` chain through Lance test tooling.

Keep `lancedb 0.26.2` and waive `lru`. Rejected because an available compatible
upgrade removes the advisory without weakening the gate.

Disable or relax the Rust audit job. Rejected because the job caught real new
advisory drift and should remain authoritative.
