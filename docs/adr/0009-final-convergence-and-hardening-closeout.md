# 0009. Final Convergence and Hardening Closeout

## Status

Accepted

## Context

By the end of Batch 9, the refactor program had already stabilized the shipped product surfaces:

- the canonical shell, queue, workspace, knowledge, analytics, and operations surfaces were live
- the Tauri command registry and database facade had already been split into safer internal seams
- the search sidecar had already converged on the adaptive-only runtime path the product actually used

The remaining debt was no longer about product behavior. It was about compatibility-heavy internals
that had been intentionally preserved for safety while earlier waves landed:

- `src-tauri/src/commands/legacy_commands.rs` still held meaningful runtime/model implementation
  logic
- `src/types/index.ts` still acted as a broad frontend compatibility barrel
- `src-tauri/src/db/mod.rs` still carried wider compatibility re-exports than the intended stable
  facade
- `fusion_strategy` still appeared in the live search request path and perf harnesses even though
  adaptive search was the only supported runtime mode

Batch 11 was the final bounded convergence wave to retire those last compatibility surfaces without
changing the product shell, Tauri command names, DB schema version, or the live search endpoint
set.

## Decision

Batch 11 finishes the remaining internal convergence work and records the repo at its smaller
steady-state shape.

### Removed in this wave

- Deleted `src-tauri/src/commands/legacy_commands.rs` after moving the remaining runtime/model
  implementation ownership into `model_commands.rs` and the already-established domain command
  modules.
- Deleted `src/types/index.ts` after migrating production imports to domain-owned type modules
  under `src/types/`.
- Removed the final live-code `fusion_strategy` residue from the search runtime path and perf
  harness expectations. The surviving search contract is the adaptive-only request shape already
  used by the app.

### Reduced in this wave

- `src-tauri/src/db/mod.rs` remains the stable `Database`/`DbError` facade, but no longer carries
  the broad store re-export surface that earlier waves kept for compatibility.
- `model_commands.rs` now owns the remaining model/runtime helper logic directly instead of routing
  through a legacy implementation module.

### Explicit non-goals for this wave

- Do not rename any Tauri commands.
- Do not change frontend `invoke(...)` names.
- Do not redesign the database API or schema.
- Do not alter the live endpoint set of the search sidecar.
- Do not reopen product-surface or navigation work.

## Consequences

### Benefits

- The command system now has one clear ownership model: registry for registration, domain modules
  for implementation.
- Frontend type imports now follow domain seams instead of depending on a broad compatibility
  barrel.
- The database facade is narrower and easier to reason about, while staying safe for callers.
- Search runtime docs, fixtures, OpenAPI, and harnesses now better reflect the actual supported
  request contract.

### Tradeoffs

- `src-tauri/src/db/mod.rs` still remains the public persistence facade rather than forcing a
  broader caller migration in the same wave.
- Historical roadmap and ADR notes still describe the temporary compatibility decisions that were
  valid earlier in the program. The closeout docs record their retirement instead of rewriting that
  history.

### Risks Accepted

- Some tests and internal call sites may continue to use the stable DB facade rather than importing
  directly from the owning stores. That is acceptable as long as the broad compatibility re-export
  surface does not regrow.
- The known Lighthouse SEO warning (`0.82` vs the `0.90` threshold) remains non-blocking because it
  predates this convergence wave and did not regress during validation.

## Alternatives Considered

### Keep `legacy_commands.rs` as a helper-only compatibility module

Rejected because the remaining command ownership debt was now concentrated enough to finish cleanly,
and keeping the file around would continue to imply a false second command home.

### Keep `src/types/index.ts` as a tiny compatibility barrel

Rejected because production imports had already converged on domain-owned modules, so leaving the
barrel behind would mainly create a path for regression.

### Keep `fusion_strategy` for one more wave

Rejected because the runtime, callers, and perf harnesses had already converged on adaptive-only
behavior. Carrying the field longer would preserve contract noise without buying real safety.
