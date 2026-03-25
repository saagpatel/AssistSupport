# 0007. Search API Runtime Path Simplification

## Status

Accepted

## Context

By the time Batch 8 started, the app had already narrowed its product usage of the Python search
sidecar:

- [src-tauri/src/commands/search_api.rs](/Users/d/AssistSupport/src-tauri/src/commands/search_api.rs)
  always sent `fusion_strategy: "adaptive"` for live desktop searches.
- The surviving product surface used the sidecar for five stable endpoints only:
  `GET /health`, `GET /ready`, `POST /search`, `POST /feedback`, and `GET /stats`.
- `Knowledge` still depended on search diagnostics, feedback submission, intent visibility, and
  service health checks.
- The live runtime still carried extra strategy branches and readiness assumptions, especially
  around reranker-backed execution, that no longer reflected the real product path.

Batch 8 needed to simplify the service around the actual runtime shape without breaking the stable
desktop contract or the checked-in OpenAPI surface.

## Decision

Batch 8 keeps the public sidecar contract stable while simplifying the runtime to the single path
the product actually uses.

### Stable public contract

- The sidecar keeps:
  - `GET /health`
  - `GET /ready`
  - `POST /search`
  - `POST /feedback`
  - `GET /stats`
- The Tauri commands remain stable:
  - `check_search_api_health`
  - `get_search_api_health_status`
  - `hybrid_search`
  - `submit_search_feedback`
  - `get_search_api_stats`
- Response shapes remain stable for the frontend and the generated OpenAPI contract.

### Adaptive-only runtime path

- The live search runtime now executes adaptive hybrid search as the only real search path.
- Legacy `fusion_strategy` values (`rrf`, `weighted`, `rerank`) remain accepted for one
  compatibility wave, but they are normalized to adaptive execution instead of reviving multiple
  runtime branches.
- The compatibility metric field `rerank_time_ms` remains in the response shape and reports `0`
  on the surviving adaptive path.

### Readiness model

- `/ready` continues to report dependency-backed readiness.
- The readiness check now reflects only the dependencies required for the surviving runtime path:
  runtime config, database, rate-limit backend, and active model components.
- Reranker-backed readiness is no longer treated as part of the live service path.

### Runtime vs maintenance tooling

- Search serving remains the primary architecture:
  auth, rate limiting, readiness, adaptive hybrid search, feedback, and stats.
- Offline scripts for embeddings, index rebuilds, title cleanup, intent training, and curated KB
  maintenance remain available, but they are documented as maintenance tooling instead of peer
  runtime architecture.

## Consequences

### Benefits

- The service is easier to reason about because it matches the real product path.
- Readiness is more honest about what the app truly depends on at runtime.
- The docs, OpenAPI text, and sidecar behavior now describe the same architecture.

### Tradeoffs

- The request contract still accepts legacy `fusion_strategy` values for one wave, which keeps a
  small amount of compatibility logic in the API layer.
- Compatibility response fields such as `rerank_time_ms` stay present until the deletion wave.

### Risks Accepted

- Some unused runtime utilities remain in the repo as offline tooling until the final deletion
  pass; Batch 8 intentionally narrows architecture first and deletes later.
- Intent detection remains part of the live experience, but the service does not add new
  readiness/dependency coupling around optional classifier assets beyond what the current runtime
  already requires.

## Alternatives Considered

### Keep the broader multi-strategy runtime intact

Rejected because the product already converged on adaptive search and the extra branches created
maintenance tax without current user value.

### Remove hybrid-search diagnostics from the product entirely

Rejected because `Knowledge` still depends on search feedback and stats for tuning and operator
inspection.

### Break the request contract immediately and remove legacy strategy values

Rejected because Batch 8 is a simplification wave, not a breaking API-change wave. Compatibility
normalization is lower-risk than changing the caller contract before the final deletion batch.
