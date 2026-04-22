# ADR 0012 — Tauri command error-type standardization

**Status:** Accepted — full migration complete
**Date:** 2026-04-22 (pilot); 2026-04-22 (completion)
**Supersedes:** —
**Superseded by:** —

## Context

`src-tauri/src/error.rs` defines a full-featured `AppError` type with stable
error codes (`DB_QUERY_FAILED`, `VALIDATION_PATH_TRAVERSAL`, etc.),
categories (Validation / Security / Network / Io / Internal / NotFound /
Cancelled / Database / Model), a `retryable` flag, optional internal
`detail`, convenience constructors for common cases, and `From<_>` impls
for `rusqlite::Error`, `std::io::Error`, `ValidationError`,
`SecurityError`, and (added during this migration in PR #81)
`jira::JiraError`.

Despite this infrastructure existing, **zero Tauri commands used it** before
this ADR. All 324 command signatures returned `Result<T, String>`, each
manually calling `.map_err(|e| e.to_string())` at every error site. The
resulting error strings are inconsistent (some prefixed, most not), unstable
(small refactors change the message), and opaque to the frontend which has
no way to branch on error kind beyond substring matching.

The obvious migration — switch every command to `Result<T, AppError>` and
let Tauri serialize the struct — would be a wire-format breaking change.
The frontend has roughly 100 error-handling sites that use
`${err}` template strings or `showError(...)` with a string argument.
Today they receive `"some error"`; with default `Serde` on a struct they
would receive `{ code, message, detail, retryable, category }` and stringify
to `"[object Object]"`. Coordinating a backend + frontend cutover across
~314 commands and ~100 error handlers in one session is impractical and
high-risk.

## Decision

Ship a pilot that proves the pattern without a flag day:

1. **Wire format stays a string.** `AppError` gets a custom `Serialize` impl
   that emits its `Display` form (`"[CODE] message"`) via
   `serializer.collect_str`. The old `#[derive(Serialize, Deserialize)]` is
   removed in favor of the explicit impl. Any frontend code doing
   `String(err)` or `` `${err}` `` gets a strictly **better** string than
   before: still a string, but now with a stable `[CODE]` prefix.
2. **Commands migrate incrementally.** Any command file can change its
   signatures from `Result<T, String>` to `Result<T, AppError>` without
   coordinating with the frontend. The pilot migrates one domain —
   `security_commands.rs` + its 14 `#[tauri::command]` wrappers in
   `commands/mod.rs` + the shared `normalize_github_host` helper — to
   establish the mechanical pattern.
3. **Cross-domain callers bridge via `Display`.** When a migrated helper is
   called from still-unmigrated code (e.g., `normalize_github_host` is
   called from `mod.rs:3733` inside a `Result<_, String>` function),
   the caller adds `.map_err(|e| e.to_string())?` to convert. These bridge
   calls are temporary and disappear as the enclosing function migrates.

## Migration pattern (the recipe)

For each command file:

1. Add `use crate::error::AppError;`.
2. Change every `Result<T, String>` in that file's impls to
   `Result<T, AppError>`.
3. Change every `.map_err(|e| e.to_string())` to an `AppError` constructor
   that matches the real error nature — e.g., `AppError::db_query_failed(e.to_string())`
   for rusqlite errors, `AppError::invalid_path(msg)` for validation failures,
   `AppError::internal(e.to_string())` as a fallback.
4. Change every inline `return Err("literal".to_string())` to the
   matching `AppError` constructor (`empty_input`, `invalid_format`, etc.).
5. Update the `#[tauri::command]` wrappers in `commands/mod.rs` to return
   `Result<T, crate::error::AppError>` so Tauri serializes the new type.
6. If the file defines helpers called from unmigrated code, bridge at the
   call site with `.map_err(|e| e.to_string())?` (acts as a TODO marker).

No `From` impls need to change. The existing `From<io::Error>`,
`From<rusqlite::Error>`, `From<ValidationError>`, `From<SecurityError>`
continue to make `?`-propagation work cleanly.

## Consequences

### Positive

- Every migrated command emits a stable `[CODE]` prefix the frontend can
  branch on with `startsWith("[VALIDATION_")`, cleaner than substring
  search against free-form messages.
- Structured fields (`category`, `retryable`, `detail`) are available
  server-side immediately — useful for the audit log, Sentry-equivalent
  telemetry, and automated retry logic.
- Migrations are independent: each file can land as its own small PR
  without coordinating with the frontend.
- Future flip to object-form serialization is a one-line change in
  `impl Serialize for AppError` once the frontend is ready to consume
  structured errors.

### Neutral

- Error strings change shape slightly — from whatever ad-hoc text was
  emitted to `[CODE] message`. The test assertion at
  `src-tauri/src/error.rs::tests::test_error_serialization` was updated
  to reflect this. No frontend tests depend on exact backend error
  strings (sampled the 13 `toThrow(...)` sites in `useLlm.test.ts` —
  all assert on **mock-returned** errors, not the wire format).

### Risk

- Low. `cargo check --all-targets` clean. `cargo test --lib` passes 311/312
  (the one pre-existing `#[ignore]`-gated model-download test is unchanged).
  No new panics, no API signature change visible through Tauri's JSON
  serialization.

## Migration timeline

The pilot + full rollout completed in a single session on 2026-04-22.
Every `#[tauri::command]` function in `src-tauri/src/commands/` now
returns `Result<T, AppError>`.

### PRs that executed the migration

| PR  | File(s) migrated                                                                            | Notable decisions                                                                                                                                                               |
| --- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #77 | `security_commands.rs` (pilot) + `error.rs` Serialize change                                | Established `[CODE] message` wire format via custom `impl Serialize`                                                                                                            |
| #78 | `app_core_commands.rs` + `pilot_feedback.rs` + `decision_tree_runtime.rs`                   | Smallest files, proved pattern scales                                                                                                                                           |
| #79 | `backup.rs` + paired frontend cancel-detection                                              | First cross-cutting wire-format update: `startsWith("[CANCELLED_BY_USER]")`                                                                                                     |
| #80 | `search_api.rs`                                                                             | `connection_failed` (retryable) for HTTP failures                                                                                                                               |
| #81 | `jira_commands.rs` + `From<JiraError>` in `error.rs`                                        | Added the first enum-backed `From` impl — cleanest per-site migration                                                                                                           |
| #83 | `jobs_commands.rs` (+ bundled dead-code cleanup)                                            | Introduced local `job_not_found(id)` helper for the `NOT_FOUND_JOB` code                                                                                                        |
| #84 | `operations_analytics_commands.rs`                                                          | 23 uniform DB-backed commands                                                                                                                                                   |
| #86 | `product_workspace.rs`                                                                      | 24 commands via a pre-existing `with_db()` helper — trivial migration                                                                                                           |
| #87 | `diagnostics.rs`                                                                            | Kept recovery-mode string pattern matching intact                                                                                                                               |
| #88 | `draft_commands.rs`                                                                         | Biggest file (38 cmds + 7 helpers); added `db_query_err` helper                                                                                                                 |
| #90 | `kb_commands.rs` (parallel worktree agent)                                                  | 45 cmds; `connection_failed` for ingest network failures                                                                                                                        |
| #91 | `model_commands.rs` + `model_runtime.rs` + `embedding_runtime.rs` (parallel worktree agent) | Local `generation_err` / `embedding_err` helpers for MODEL_GENERATION_FAILED                                                                                                    |
| #92 | `vector_runtime.rs` + `download_runtime.rs` + `ocr_runtime.rs` + bridge cleanup             | Preserved exact "Image too large" wording to keep contract test green (code + `to_string()` substring check)                                                                    |
| #93 | `memory_kernel.rs`                                                                          | `integration_base_url` internal helper kept on `String` — its error becomes a struct field                                                                                      |
| #94 | `startup_commands.rs`                                                                       | Last file — critical boot path, preserved `recovery_result_from_database_error(error: String)` param so `classify_startup_recovery_issue` can still text-match rusqlite phrases |

### Dead-code sweeps bundled along the way

Four separate PRs (#82, #83, #85, #89) deleted **~2,026 LOC** of
duplicate Tauri wrappers from `commands/mod.rs` that shadowed the
domain-specific files. Same pattern every time: unregistered,
uncalled, full reimplementations left over from a prior layout.
`commands/mod.rs` shrank from 6,022 → ~3,950 lines (−35%).

## Final-state counts

Run from repo root:

```bash
# Should be 0 across all command files (Result<T, String> eliminated)
grep -rcE "Result<[^,<>]+, String>" --include='*.rs' src-tauri/src/commands/

# Should be high (every command is AppError now)
grep -rcE "Result<[^,<>]+, (AppError|crate::error::AppError)>" \
  --include='*.rs' src-tauri/src/commands/
```

As of the completing PR (#94), the `Result<T, String>` count across
`src-tauri/src/commands/` is zero. Remaining `Result<T, String>` in
the crate lives in internal helpers outside `commands/` that are not
Tauri-exposed (e.g., database methods returning `DbError`, which
continues to auto-convert to `AppError::db_query_failed` at the
command boundary).

## Residual pointers for follow-up work

- **`mod.rs::generate_kb_embeddings_internal`** is a `pub(super)`
  helper still on `Result<_, String>`. It's called from
  `diagnostics::rebuild_vector_store` through a tiny
  `.map_err(AppError::internal)?` bridge. Migrating it would ripple
  into a couple of other mod.rs internal helpers; optional cleanup.
- **`kb_commands.rs` Tauri wrappers** still declare
  `Result<_, String>` and delegate to `_impl` functions that return
  `AppError`. Wire format is identical (Display → `[CODE] message`),
  but the wrapper layer is inconsistent with the other migrated
  files. Cosmetic cleanup only.
- **Frontend `startsWith("[CODE]")` branching** is available
  everywhere now. Consider introducing a typed `AppErrorInfo` helper
  in `src/` that parses the `[CODE] message` string into a
  discriminated union for cleaner error-handling in React components.

## Methodology artifacts

To re-audit any regression on future commits:

```bash
# Commands still on Result<T, String> (should stay at 0)
grep -rhE '-> Result<[^,<>]+, ?String>' \
  --include='*.rs' src-tauri/src/commands/ | wc -l

# Commands migrated to Result<T, AppError>
grep -rhE '-> Result<[^,<>]+, ?(AppError|crate::error::AppError)>' \
  --include='*.rs' src-tauri/src/commands/ | wc -l
```
