# AGENTS.md

<!-- comm-contract:start -->

## Communication Contract

- Inherit global Codex communication and reporting rules from `/Users/d/.codex/AGENTS.override.md` and `/Users/d/.codex/policies/communication/BigPictureReportingV1.md`.
- Repo-specific instructions below add project constraints only; do not restate global voice or status-reporting rules here.
<!-- comm-contract:end -->

## Repo-Specific Completion Rules

- Use a non-main branch named `codex/<type>/<slug>` for implementation work.
- Commits must be atomic and follow Conventional Commits.
- PR descriptions must include What/Why/How/Testing/Risks, performance impact, lockfile rationale when lockfiles changed, and screenshots for UI changes.
- Performance checks required before done:
  - bundle delta
  - build time delta
  - Lighthouse budgets
  - API latency thresholds
  - DB query health checks
  - asset-size checks
- Any required gate in `fail` or `not-run` blocks completion.

## Review guidelines

Focus Codex review on local-first privacy boundaries, encrypted workspace data,
KB/search grounding, optional local-LLM behavior, Tauri desktop permissions,
and UI changes that affect keyboard access, focus, mobile/responsive layout,
loading, empty, or error states. Treat changes that send support queries, KB
contents, tokens, transcripts, or workspace data to cloud services without an
explicit design change as merge-relevant.

For UI PRs, comment when the diff lacks verification for the changed surface or
would make an important workflow inaccessible, visually clipped, or misleading.
Review UI changes against the real support workflow: knowledge search,
grounding/reranking, draft generation, source review, settings, ingest, and
workspace selection. Loading, empty, permission-denied, offline/local-model
unavailable, search-no-results, and backend-error states are merge-relevant
when the changed surface can leave the operator stuck or misled.
For docs-only PRs, comment only when docs claim current privacy, encryption,
model-routing, release, performance, or verification behavior that the reviewed
files or commands do not support.

## Inherited Operating Rules

- Inherit global git, review/fix, testing, docs, UI, security, skill-use, and reporting gates from `/Users/d/.codex/AGENTS.md` and active session instructions.
- Use `.codex/verify.commands` and `.codex/scripts/run_verify_commands.sh` as this repo-local verification authority when present.

<!-- portfolio-context:start -->

# Portfolio Context

## What This Project Is

AssistSupport is a local-first macOS support-assistant app. It combines a Tauri desktop shell, local encrypted storage, intent classification, TF-IDF retrieval, cross-encoder reranking, and optional local LLM inference to draft grounded IT support answers from an operator-owned knowledge base.

## Current State

The repo is active product work. The README describes the intended support workflow, core search pipeline, and local privacy posture. Current local changes include unrelated dependency-lock work, so recovery edits should stay limited to documentation context unless the active branch owner explicitly broadens scope.

## Stack

| Layer         | Technology                                          |
| ------------- | --------------------------------------------------- |
| Desktop shell | Tauri 2 + Rust                                      |
| Frontend      | React + TypeScript + Vite                           |
| ML search     | TF-IDF, Logistic Regression, ms-marco-MiniLM-L-6-v2 |
| Local storage | SQLite (encrypted)                                  |
| LLM inference | Local via llama.cpp (optional)                      |
| Fonts         | IBM Plex Sans, JetBrains Mono                       |

## How To Run

- Install dependencies with `pnpm install`.
- Run the desktop development loop with `pnpm dev`.
- Build the Tauri app with `pnpm tauri build`.
- Run the repo's required lint, typecheck, test, coverage, diff coverage, and docs gates before shipping behavior changes.

## Known Risks

- Core workspace data and token material must remain local and encrypted at rest.
- Optional vector-search embeddings are local but not currently encrypted at rest when vector search is enabled.
- Do not route support queries or KB contents to cloud inference unless a future design explicitly changes the privacy contract.
- Preserve the reviewer -> fixer -> reviewer loop and ADR requirement for architecture-impacting changes.

## Next Recommended Move

Stabilize the active dependency-lock work on the existing branch, then run the repo health gates before any release or security claim.

<!-- portfolio-context:end -->
