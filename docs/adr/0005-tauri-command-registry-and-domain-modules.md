# 0005. Tauri Command Registry And Domain Module Split

## Status

Accepted

## Context

The Tauri command layer had two linked problems:

- [src-tauri/src/commands/mod.rs](/Users/d/AssistSupport/src-tauri/src/commands/mod.rs) had grown into a multi-thousand-line command hotspot.
- [src-tauri/src/lib.rs](/Users/d/AssistSupport/src-tauri/src/lib.rs) still owned one giant `generate_handler!` block, so registration and permission coverage depended on the same brittle file shape.

That made command changes hard to review, hard to permission-audit, and easy to regress. It also blocked the next database-internal split because command ownership was still too centralized.

## Decision

Batch 6 moves the command surface to a dedicated registry and a domain-indexed command tree while keeping public command names stable.

### Registration source of truth

- `src-tauri/src/commands/registry.rs` is now the single source of truth for the Tauri command list.
- `src-tauri/src/lib.rs` keeps only the `invoke_handler(...)` call site and uses the centralized registry macro.
- Build-time and test-time command parsing now follow the registry instead of scraping `lib.rs`.

### Thin command index

- `src-tauri/src/commands/mod.rs` is now a thin module index and re-export layer.
- A regression test blocks `mod.rs` from directly owning `#[tauri::command]` functions again.

### Temporary legacy implementation home

- The older command implementations moved into `legacy_commands.rs`.
- This keeps runtime behavior stable while the public command surface is reorganized.
- Existing specialized modules such as `backup`, `diagnostics`, `startup_commands`, `search_api`, `memory_kernel`, `pilot_feedback`, and `product_workspace` remain the first-class homes for their already-extracted command groups.

### Permission alignment

- The registry command groups mirror the permission zones in `src-tauri/permissions/default.toml`.
- The permission-manifest test now validates the registry directly.

## Consequences

### Benefits

- Command registration, permission coverage, and build-time manifest generation all use the same source of truth.
- `mod.rs` is no longer the runtime choke point for every command change.
- Batch 7 can split database internals without first fighting a monolithic command root.

### Tradeoffs

- Some command implementations still live in `legacy_commands.rs` as a temporary compatibility step.
- The surface is cleaner than the internal implementation layout. That is intentional for this wave.

### Risks Accepted

- The registry macro is now a critical piece of backend structure. Tests and the build script must keep following it.
- Internal logic concentration still exists in `legacy_commands.rs`, so future cleanup should continue reducing that file instead of treating Batch 6 as the final backend shape.

## Alternatives Considered

### Keep the giant `generate_handler!` block in `lib.rs`

Rejected because it left registration, permissions, and build-manifest parsing coupled to the app entrypoint.

### Move every command implementation into a fully cleaned domain module in one batch

Rejected because it mixed registration refactoring with large-scale behavior movement across high-risk runtime code.

### Use only re-export modules for registration paths

Rejected because Tauri command registration needs the real command-owning module for its generated macros, not just a re-exported symbol path.
