# AssistSupport

[![Version](https://img.shields.io/badge/version-1.3.1-10a37f)](#) [![Platform](https://img.shields.io/badge/platform-macOS-lightgrey)](#) [![License](https://img.shields.io/badge/license-MIT-blue)](#) [![Core Health](https://img.shields.io/badge/core--health-gated-blue)](#) [![Coverage](https://img.shields.io/badge/diff--coverage-gated-blue)](#)

> Your support team's second brain — ML-powered answers from your own knowledge base, in under 25ms, without sending a single query to the cloud.

AssistSupport combines local LLM inference with a hybrid ML search pipeline to generate accurate, KB-informed IT support responses. A TF-IDF/logistic regression intent classifier (with keyword fallback when its model is unavailable) routes queries before PostgreSQL full-text and pgvector retrieval combine candidates through adaptive fusion. Cross-encoder reranking is an optional engine path, disabled by default and not selected by the live `/search` endpoint. The entire pipeline — app, sidecar, and model inference — runs on your machine. Core SQLite data is encrypted at rest via SQLCipher (AES-256), and token material is encrypted separately with AES-256-GCM; optional vector-search embeddings stay local but are not currently encrypted at rest when vector search is enabled. See [docs/SECURITY.md](docs/SECURITY.md) for the full security architecture.

```
User asks:    "Can I use a flash drive?"
ML Intent:    POLICY detected (86% confidence)
Search finds: USB/removable media policy in 21ms
Fusion:       Adaptive fusion combines keyword and vector scores
AI drafts:    "Per IT Security Policy 4.2..."
You copy:     Paste into Jira — done in under a minute
```

## Features

- **ML intent classification** — TF-IDF/logistic regression routes queries before retrieval starts, with keyword fallback when the trained model is unavailable.
- **Sub-25ms hybrid search** — PostgreSQL full-text retrieval plus pgvector search with adaptive fusion across 3,500+ KB articles.
- **Encrypted local workspace** — Core SQLite data stays local and encrypted at rest via SQLCipher (AES-256); token material is encrypted separately with AES-256-GCM. Vector-search embeddings are local but plaintext at rest when the optional vector store is enabled.
- **Trust-gated responses** — Confidence modes and source grounding reduce unsupported output.
- **Self-improving feedback loop** — KB gap analysis turns low-confidence patterns into follow-up work.
- **Ops-ready workspace** — Deployment, rollback, and integration configuration live in the Ops workspace; triage and runbook tooling live in the queue and ticket workspace.

## Quick Start

### Prerequisites

- Node.js 22.19+ (22.x) or 24+ (per the locked Vite, Vitest, jsdom, and Lighthouse requirements)
- pnpm 9+
- Rust toolchain (stable) with Tauri v2 prerequisites for macOS

### Installation

```bash
git clone https://github.com/saagpatel/AssistSupport.git
cd AssistSupport
pnpm install
```

### Run

```bash
pnpm tauri dev
```

`pnpm dev` starts only the Vite frontend server.

### Build

```bash
pnpm tauri build
```

## Public Demo & Portfolio Collateral

The public demo package is sanitized and uses only fictional Northstar Labs
support data. Start with the [sanitized demo plan](docs/demo/sanitized-demo-plan.md)
for the fake-KB script, cleanup list, and verification checklist.

For portfolio review, use [docs/portfolio/README.md](docs/portfolio/README.md)
as the single entry point. It links the screenshot set, one-pager PDF, deck PDF
preview, case study, rehearsal kit, and 90-second video script. The current
pre-publish handoff lives in
[docs/demo/portfolio-handoff-bundle.md](docs/demo/portfolio-handoff-bundle.md).

## Health Checks

Use the daily truth source for normal development and PR confidence:

```bash
pnpm health:repo
```

Use the release-only health command when you need heavier validation:

```bash
pnpm health:release
```

`pnpm health:release` runs the core repo health path plus coverage generation, build-time, bundle, asset, memory, and Lighthouse checks. API latency and DB query health are skipped unless `BASE_URL` and `DATABASE_URL` are configured.

Diff coverage is enforced in CI. Overall line coverage is informational and is not the primary health target.

The current health contract lives in [docs/status/current-health.md](docs/status/current-health.md).

## Core Commands

```bash
# Static checks
pnpm lint
pnpm typecheck
pnpm stylelint

# Test suites
pnpm test
pnpm search-api:test
pnpm test:ci
pnpm ui:gate:regression

# Release-only checks
pnpm test:coverage
pnpm perf:build
pnpm perf:bundle
pnpm perf:assets
pnpm perf:memory
pnpm perf:lhci
```

## Contributing

Create work on a compliant branch:

```bash
pnpm git:branch:create "your feature" feat
```

Before opening a PR, run:

```bash
pnpm health:repo
```

Push your `codex/<type>/<slug>` branch and open a PR against `master`.

## Tech Stack

| Layer         | Technology                                                                                                                         |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Desktop shell | Tauri 2 + Rust                                                                                                                     |
| Frontend      | React + TypeScript + Vite                                                                                                          |
| ML search     | TF-IDF + Logistic Regression intent classification; PostgreSQL FTS + pgvector retrieval; optional ms-marco-MiniLM-L-6-v2 reranking |
| Local storage | SQLite (encrypted)                                                                                                                 |
| LLM inference | Local via llama.cpp (optional)                                                                                                     |
| Fonts         | IBM Plex Sans, JetBrains Mono                                                                                                      |

## Architecture

AssistSupport is a Tauri 2 desktop app with a Rust backend handling search, encryption, and LLM orchestration. The ML pipeline runs as a local sidecar: intent classification happens first, then PostgreSQL full-text and pgvector retrieval combine candidates through adaptive fusion. Cross-encoder reranking is available in the engine but disabled by default in the live search path. Ratings feed back into the local SQLite store and surface gap analysis via the Analytics workspace.

## License

MIT
