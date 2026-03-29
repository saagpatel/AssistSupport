# AssistSupport

[![Rust](https://img.shields.io/badge/Rust-%23dea584?style=flat-square&logo=rust)](#) [![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](#) [![Platform](https://img.shields.io/badge/platform-macOS-lightgrey?style=flat-square)](#)

> Your support team's second brain — ML-powered answers from your own knowledge base, in under 25ms, without sending a single query to the cloud.

AssistSupport combines local LLM inference with a hybrid ML search pipeline to generate accurate, KB-informed IT support responses. A logistic regression intent classifier (85.7% accuracy) routes queries before a TF-IDF retriever finds candidates, and a cross-encoder reranker (ms-marco-MiniLM-L-6-v2) sharpens relevance before the response is drafted. The entire pipeline — app, sidecar, and model inference — runs on your machine. Core workspace data is encrypted at rest.

```
User asks:    "Can I use a flash drive?"
ML Intent:    POLICY detected (86% confidence)
Search finds: USB/removable media policy in 21ms
Reranker:     Cross-encoder confirms top result relevance
AI drafts:    "Per IT Security Policy 4.2..."
You copy:     Paste into Jira — done in under a minute
```

## Features

- **ML Intent Classification** — Logistic regression classifier routes queries to the right search strategy before retrieval even starts
- **Sub-25ms Hybrid Search** — p50: 8ms, p95: 82ms across 3,500+ KB articles; TF-IDF + cross-encoder reranker pipeline
- **Encrypted Local Workspace** — Core SQLite database and stored secrets are protected with wrapped keys and encrypted-at-rest storage; no cloud dependency for the primary workflow
- **Trust-Gated Responses** — Confidence modes (answer / clarify / abstain), claim grounding map, citation-aware copy safety for low-confidence output
- **Self-Improving Feedback Loop** — KB gap detector surfaces repeated low-confidence topics and tracks remediation over time
- **Ops-Ready Workspace** — Deployment preflight, rollback flows, eval harness runs, triage clustering, and runbook sessions built in

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 9+
- Rust toolchain (stable) + Tauri v2 prerequisites for macOS

### Installation

```bash
git clone https://github.com/saagpatel/AssistSupport.git
cd AssistSupport
pnpm install
cp .env.example .env
```

### Run (development)

```bash
pnpm dev
```

### Build (desktop app)

```bash
pnpm tauri build
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Desktop shell | Tauri 2 + Rust |
| Frontend | React + TypeScript + Vite |
| ML search | TF-IDF, Logistic Regression, ms-marco-MiniLM-L-6-v2 |
| Local storage | SQLite (encrypted) |
| LLM inference | Local via Ollama (optional) |
| Fonts | IBM Plex Sans, JetBrains Mono |

## Architecture

AssistSupport is a Tauri 2 desktop app with a Rust backend handling search, encryption, and LLM orchestration. The ML pipeline runs as a local sidecar: intent classification happens first, then candidate retrieval via TF-IDF index, then cross-encoder reranking to select the most relevant KB articles before response generation. The feedback loop writes ratings back to a local SQLite store and periodically surfaces gap analysis via the Ops workspace.

## License

MIT
