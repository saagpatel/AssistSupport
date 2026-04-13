# 0006. Database Facade And Internal Store Split

## Status

Accepted

## Context

The local SQLite layer had become the next backend hotspot after the Tauri command split:

- [src-tauri/src/db/mod.rs](/Users/d/AssistSupport/src-tauri/src/db/mod.rs) had grown into a mixed bootstrap, migration, runtime-state, draft, knowledge, analytics, workspace, and test file.
- The code already had real seam lines, but they were trapped inside one implementation surface, which made review, targeted testing, and future store changes riskier than necessary.
- Batch 7 needed to improve internal ownership without changing the public `Database` facade, schema version, migration ordering, or frontend command behavior.

## Decision

Batch 7 keeps `Database` as the stable facade and moves its internal method bodies into store-oriented modules under `src-tauri/src/db/`.

### Stable public surface

- `Database`, `DbError`, and the current public record types remain import-compatible from `crate::db::*`.
- The current schema version remains `15`.
- Migration SQL, order, and table/index defaults remain behaviorally unchanged.
- Tauri command names and frontend callers do not change in this batch.

### Internal module split

The database implementation is now organized by real operational seams:

- `bootstrap.rs`
- `migrations.rs`
- `runtime_state_store.rs`
- `draft_store.rs`
- `knowledge_store.rs`
- `analytics_ops_store.rs`
- `workspace_store.rs`
- existing `job_store.rs`, `executor.rs`, and `path_helpers.rs`

`db/mod.rs` is reduced to:

- stable public type and error definitions
- module declarations
- compatibility re-exports
- small shared helpers that are genuinely cross-domain

### No new abstraction framework

- The split uses plain Rust modules plus `impl Database` blocks.
- `Database` still owns the `rusqlite::Connection`.
- No repository traits, facade wrapper types, or generic storage framework are introduced.

## Consequences

### Benefits

- Database ownership is easier to review by domain instead of by file position inside one monolith.
- Future backend batches can change drafts, knowledge, analytics, or workspace persistence without reopening unrelated persistence logic.
- Migration logic, backup behavior, and store methods now have clearer homes for targeted tests.

### Tradeoffs

- `db/mod.rs` still keeps a large set of public record types for compatibility in this wave.
- Some cross-module helper methods needed `pub(crate)` visibility after the split because sibling store files now share a single facade type.

### Risks Accepted

- The facade stays wider than the ideal long-term shape because keeping import compatibility is more valuable than forcing a broad caller rewrite in Batch 7.
- SQLite-local query-health checks are still lighter than a full performance harness; they are intended as regression smoke coverage, not as production benchmarking.

## Alternatives Considered

### Keep the full implementation in `db/mod.rs`

Rejected because it left the main persistence hotspot intact and blocked the next backend wave from making isolated changes safely.

### Introduce repository traits or a new database abstraction layer

Rejected because the goal of Batch 7 is seam extraction, not architecture invention. A new abstraction framework would add more moving parts than value.

### Change schema shape while splitting modules

Rejected because combining internal reorganization with schema redesign would make failures harder to localize and rollback.
