# 0010. Final Module Right-Sizing and Release-Readiness

## Status

Accepted

## Context

By the end of Batch 11, the refactor program had already finished the product-surface,
compatibility-retirement, and major backend seam work:

- the shipped shell, queue, workspace, knowledge, analytics, and operations surfaces were stable
- the Tauri command registry was already the single source of truth for command registration
- the database internals were already split behind the stable `Database` facade
- the search sidecar had already converged on the adaptive-only runtime contract the app actually
  used

The remaining Phase 12 work was smaller and more structural:

- `src-tauri/src/commands/model_commands.rs` still mixed public command wrappers with helper-heavy
  runtime ownership
- `src-tauri/src/db/mod.rs` was still carrying a large block of public record types instead of
  acting like a narrower facade and re-export index
- `src-tauri/src/commands/mod.rs` still re-exported more of the command surface than the
  registry-based architecture required
- the local setup needed for `perf:api` and `perf:db` had been mentioned in closeout notes, but
  not yet recorded as a reusable runbook

Phase 12 is the final right-sizing wave for those structural leftovers. It intentionally avoids
new product work, command renames, schema changes, or search endpoint changes.

## Decision

Phase 12 narrows the remaining oversized module surfaces and records the release-readiness harness
explicitly.

### Command/runtime right-sizing

- `model_commands.rs` remains the public Tauri command/controller surface for model and runtime
  flows.
- Helper-heavy runtime logic moves into helper-owned `pub(crate)` modules:
  - `model_runtime.rs`
  - `embedding_runtime.rs`
  - `download_runtime.rs`
  - `ocr_runtime.rs`
  - `decision_tree_runtime.rs`
- The command registry in `src-tauri/src/commands/registry.rs` remains the only command
  registration source of truth.

### Database facade right-sizing

- `src-tauri/src/db/mod.rs` remains the stable home of `Database`, `DbError`,
  `CURRENT_VECTOR_STORE_VERSION`, and the intentionally public facade surface.
- Remaining public record types move into dedicated domain-owned DB type modules:
  - `types_runtime.rs`
  - `types_drafts.rs`
  - `types_knowledge.rs`
  - `types_analytics_ops.rs`
  - `types_workspace.rs`
- `db/mod.rs` now re-exports that public surface instead of defining the full type monolith inline.

### Command export narrowing

- `src-tauri/src/commands/mod.rs` keeps the domain module declarations.
- Broad blanket command-module re-exports are retired.
- Only the specific command contract types still needed by real consumers are re-exported.

### Release-readiness documentation

- The canonical local setup for `perf:api` and `perf:db` is documented in
  `docs/runbooks/search-api-local-deployment.md`.
- That runbook now covers temporary local Postgres setup, minimal search schema/seed shape, local
  loopback sidecar startup, the perf commands themselves, and shutdown cleanup.

## Explicit Non-Goals

- Do not rename any Tauri commands.
- Do not change frontend `invoke(...)` names.
- Do not change the live search endpoint set.
- Do not change the finalized search request/response contract from Batch 11.
- Do not redesign the database API or schema.
- Do not reopen product-surface or navigation work.

## Consequences

### Benefits

- `model_commands.rs` is easier to review and much less likely to regrow into a second runtime
  monolith.
- `db/mod.rs` is closer to its intended steady-state role as stable facade plus compatibility
  re-export index.
- The command subsystem is clearer: registry for registration, domain command modules for public
  wrappers, helper modules for private runtime work.
- Perf verification is more reproducible because the required local harness setup is documented
  explicitly instead of living only in batch-close notes.

### Tradeoffs

- `model_commands.rs` still remains the public wrapper home instead of pushing command declarations
  into many smaller files. That preserves stable command ownership while still shrinking the file to
  a manageable size.
- `db/mod.rs` still re-exports the intentionally public DB surface for caller stability rather than
  forcing a larger direct-import migration in the final hardening wave.

### Risks Accepted

- Some internal and test callers may continue to use the stable `crate::db::*` surface where that
  is still the intentionally supported compatibility layer.
- The non-blocking Lighthouse SEO warning (`0.82` vs the `0.90` threshold) remains a known
  carry-forward item because it predates this wave and did not regress during Phase 12 work.

## Alternatives Considered

### Leave `model_commands.rs` as-is

Rejected because the helper-heavy implementation ownership was the last meaningful command/runtime
structure tax left in the codebase, and extracting it no longer required risky product changes.

### Force direct DB type imports everywhere in the same wave

Rejected because the goal was to right-size the facade, not to create a broad caller churn wave at
the end of the program.

### Keep perf harness setup only in closeout notes

Rejected because reproducible validation should survive beyond one branch-close message. A runbook
is the better long-term memory surface.
