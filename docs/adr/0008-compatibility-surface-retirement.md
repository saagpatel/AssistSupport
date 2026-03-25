# 0008. Compatibility Surface Retirement After Stabilization Waves

## Status

Accepted

## Context

Batches 5-8 intentionally kept several temporary compatibility surfaces so the refactor program
could land in smaller, safer waves:

- queue, pilot, and search wrapper pages remained available for one wave after their canonical
  replacements existed
- `useFeatureOps.ts` remained as a forwarding shim while the frontend moved to domain hooks
- the search-api request contract kept compatibility-only strategy handling and the response shape
  kept `rerank_time_ms` even though the live runtime path no longer used reranking
- the repo still carried offline/runtime framing that implied broader search behavior than the
  product actually exposed

By the start of Batch 9, the canonical shell, queue, workspace, knowledge, analytics, operations,
command registry, database facade, and adaptive-only search runtime had already been validated end
to end. The compatibility layers were now maintenance tax instead of safety rails.

## Decision

Batch 9 retires compatibility surfaces whose replacements have already survived a full validation
wave.

### Removed in this wave

- Deleted retired wrapper screens and routes for old queue, pilot, and search entry points.
- Deleted the standalone `FollowUpsTab` compatibility surface after Queue fully absorbed its
  history/template workflows.
- Deleted `useFeatureOps.ts` after production callers converged on the narrower domain hooks.
- Removed search-api compatibility-only reranker residue:
  - deleted `reranker.py`
  - removed `rerank_time_ms` from the generated contract and response expectations
  - reduced score-fusion helpers to the surviving adaptive path
- Kept the search endpoint set and Tauri command names stable while tightening live search to the
  adaptive-only path the app already uses.

### Explicit non-goals for this wave

- Do not decompose `legacy_commands.rs`; that remains a later backend convergence task.
- Do not remove the stable `Database` facade or schema-compatibility layer.
- Do not force a repo-wide migration away from `src/types/index.ts` while dozens of live imports
  still depend on it.

## Consequences

### Benefits

- The app shell, queue, and knowledge surfaces no longer preserve dead wrapper paths.
- Search-api docs, tests, mocks, and generated contract now match the runtime behavior more
  closely.
- Future cleanup work can focus on deeper backend convergence instead of carrying stale product
  wrappers.

### Tradeoffs

- `fusion_strategy` remains in the request shape for one more wave, but only `adaptive` is
  supported.
- `src/types/index.ts` remains as a broad import surface because removing it in the same wave would
  have expanded the cleanup into a much larger migration.

### Risks Accepted

- Historical ADRs and roadmap notes still describe the temporary compatibility decisions made in
  earlier phases. Batch 9 records the retirement in new closeout docs rather than rewriting that
  historical context.
- Phase 9 does not finish the deeper backend cleanup around `legacy_commands.rs` or DB re-export
  reduction; that work is intentionally deferred to the next phase.

## Alternatives Considered

### Keep all compatibility layers until the final backend convergence wave

Rejected because the wrapper screens and search compatibility residue were already dead weight after
the earlier batches stabilized.

### Remove `src/types/index.ts` completely in the same wave

Rejected because the branch still has broad live usage of that barrel, and removing it now would
turn a deletion wave into a larger frontend migration.
