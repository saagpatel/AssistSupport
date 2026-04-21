# AssistSupport

[![Version](https://img.shields.io/badge/version-1.2.0-10a37f)](#) [![Platform](https://img.shields.io/badge/platform-macOS-lightgrey)](#) [![License](https://img.shields.io/badge/license-MIT-blue)](#) [![Core Health](https://img.shields.io/badge/core--health-gated-blue)](#) [![Coverage](https://img.shields.io/badge/diff--coverage-gated-blue)](#)

> Your support team's second brain — ML-powered answers from your own knowledge base, in under 25ms, without sending a single query to the cloud.

AssistSupport combines local LLM inference with a hybrid ML search pipeline to generate accurate, KB-informed IT support responses. A logistic regression intent classifier routes queries before a TF-IDF retriever finds candidates, and a cross-encoder reranker sharpens relevance before the response is drafted. The entire pipeline — app, sidecar, and model inference — runs on your machine. Core workspace data is encrypted at rest.

```
User asks:    "Can I use a flash drive?"
ML Intent:    POLICY detected (86% confidence)
Search finds: USB/removable media policy in 21ms
Reranker:     Cross-encoder confirms top result relevance
AI drafts:    "Per IT Security Policy 4.2..."
You copy:     Paste into Jira — done in under a minute
```

## Features

- **ML intent classification** — Logistic regression routes queries before retrieval starts.
- **Sub-25ms hybrid search** — TF-IDF retrieval plus cross-encoder reranking across 3,500+ KB articles.
- **Encrypted local workspace** — Core SQLite data and secrets stay local and encrypted at rest.
- **Trust-gated responses** — Confidence modes and source grounding reduce unsupported output.
- **Self-improving feedback loop** — KB gap analysis turns low-confidence patterns into follow-up work.
- **Ops-ready workspace** — Deployment, rollback, eval, triage, and runbook tooling ship with the app.

## Quick Start

### Prerequisites

- Node.js 20+
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
pnpm dev
```

### Build

```bash
pnpm tauri build
```

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

| Layer         | Technology                                          |
| ------------- | --------------------------------------------------- |
| Desktop shell | Tauri 2 + Rust                                      |
| Frontend      | React + TypeScript + Vite                           |
| ML search     | TF-IDF, Logistic Regression, ms-marco-MiniLM-L-6-v2 |
| Local storage | SQLite (encrypted)                                  |
| LLM inference | Local via Ollama (optional)                         |
| Fonts         | IBM Plex Sans, JetBrains Mono                       |

## Architecture

AssistSupport is a Tauri 2 desktop app with a Rust backend handling search, encryption, and LLM orchestration. The ML pipeline runs as a local sidecar: intent classification happens first, then candidate retrieval via TF-IDF, then cross-encoder reranking to select the most relevant KB articles before response generation. Ratings feed back into the local SQLite store and surface gap analysis via the Ops workspace.

## License

MIT
