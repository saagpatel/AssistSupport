# ADR 0012 — Tauri command error-type standardization (pilot)

**Status:** Accepted (pilot); full rollout deferred
**Date:** 2026-04-22
**Supersedes:** —
**Superseded by:** —

## Context

`src-tauri/src/error.rs` defines a full-featured `AppError` type with stable
error codes (`DB_QUERY_FAILED`, `VALIDATION_PATH_TRAVERSAL`, etc.),
categories (Validation / Security / Network / Io / Internal / NotFound /
Cancelled / Database / Model), a `retryable` flag, optional internal
`detail`, convenience constructors for common cases, and `From<_>` impls
for `rusqlite::Error`, `std::io::Error`, `ValidationError`, and
`SecurityError`.

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

## Migration runway (remaining work)

13 command files and ~310 commands remain on `Result<T, String>`. Rough
size ordering (smallest first, safest to migrate):

| File                               | Commands | Notes                                        |
| ---------------------------------- | -------: | -------------------------------------------- |
| `app_core_commands.rs`             |        4 | Tiny after `greet` removal (ADR 0011)        |
| `pilot_feedback.rs`                |        5 | Isolated, simple analytics                   |
| `vector_runtime.rs`                |        — | Small runtime helpers                        |
| `decision_tree_runtime.rs`         |        — | Isolated                                     |
| `download_runtime.rs`              |        — | Isolated                                     |
| `startup_commands.rs`              |        3 | Startup-critical — test carefully            |
| `backup.rs`                        |        4 | Touches filesystem, `From<io::Error>` helps  |
| `draft_commands.rs`                |      ~40 | Large but mechanical                         |
| `kb_commands.rs`                   |      ~45 | Largest; consider splitting                  |
| `model_commands.rs`                |      ~40 | Large; `model_runtime.rs` has the real logic |
| `operations_analytics_commands.rs` |      ~24 | Many read-only queries                       |
| `jira_commands.rs`                 |       10 | External I/O — good AppError candidates      |
| `product_workspace.rs`             |      ~24 | Mixed                                        |
| `search_api.rs`                    |        7 | HTTP calls — `connection_failed()` fits      |
| `jobs_commands.rs`                 |       10 |                                              |

Target cadence: one file per PR, `--admin --merge` allowed since each
migration is a pure refactor that passes `cargo test`.

## Methodology artifacts

To re-audit progress on future commits:

```bash
# Commands still on Result<T, String>
grep -rhE '^\s*\) -> Result<[^,]+, ?String>' \
  --include='*.rs' src-tauri/src/commands/ | wc -l

# Commands migrated to Result<T, AppError>
grep -rhE '^\s*\) -> Result<[^,]+, ?(AppError|crate::error::AppError)>' \
  --include='*.rs' src-tauri/src/commands/ | wc -l
```

Before this PR: 0 command files on AppError. After this PR: `security_commands.rs` + its 14 wrappers in `commands/mod.rs` on AppError, 13+ files remaining on `Result<T, String>`. Endgame: every command file on `Result<T, AppError>`.
