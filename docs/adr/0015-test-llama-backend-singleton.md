# ADR 0015: Share The Llama Backend In Rust Tests

## Status

Accepted

## Context

`llama-cpp-2` 0.1.151 permits backend initialization only once per process.
AssistSupport had independent embedding and LLM engine tests that each initialized
the backend. When the full Rust suite ran in one process, later tests failed with
`BackendAlreadyInitialized` even though production initialization remained valid.

## Decision

Keep production backend ownership unchanged. Under `cfg(test)`, initialize one
`LlamaBackend` in a `OnceLock<Arc<LlamaBackend>>` and clone the `Arc` into engine
tests. Add a source-policy regression test so future tests do not reintroduce
independent backend initialization.

## Consequences

- Rust engine tests can run together against llama-cpp 0.1.151.
- The singleton helper is absent from production builds.
- Tests share process-wide backend state, matching the upstream library contract.
- Model-loading tests remain ignored unless their model fixture is available.
