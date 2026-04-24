# Landscape-Letter One-pager

Session 3 of the AssistSupport portfolio pass. A single-page landscape
letter (11in × 8.5in) that sits next to the screenshot set as the
print-ready portfolio leave-behind.

## Output

| File                                                       | Purpose                               |
| ---------------------------------------------------------- | ------------------------------------- |
| [AssistSupport-one-pager.pdf](AssistSupport-one-pager.pdf) | Print-ready landscape letter, 1 page. |
| [AssistSupport-one-pager.png](AssistSupport-one-pager.png) | 2× PNG preview (2112 × 1632) for web. |
| [one-pager.html](one-pager.html)                           | Source. Regenerate via the script.    |
| [generate.mjs](generate.mjs)                               | Playwright-based PDF + PNG generator. |

## Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ [A] AssistSupport           ● runs on mac · Tauri 2 · portfolio  │
├──────────────────────────────────────────────────────────────────┤
│ YOUR SUPPORT TEAM'S SECOND BRAIN                                  │
│                                                                   │
│ ML-powered answers from                        ┌────────────────┐│
│ your own knowledge base                        │                ││
│ — in under 25ms, without                       │  HERO SHOT     ││
│ sending a single query to                      │  (workspace)   ││
│ the cloud.                                     │                ││
│ [Sub-paragraph explaining the stack…]          └────────────────┘│
│                                                                   │
│ FIVE FEATURE PILLARS                                              │
│ [01 ML intent] [02 Hybrid] [03 Trust] [04 Feedback] [05 Local]    │
│                                                                   │
│ ──────────────────────────────────────────────────────────────── │
│   25%              │   <25ms              │   3,500+              │
│   ticket deflection│   hybrid search p50  │   KB articles indexed │
│ ──────────────────────────────────────────────────────────────── │
│ Tauri · React · TS · Rust · SQLCipher · Ollama   github.com/…     │
└──────────────────────────────────────────────────────────────────┘
```

## Design-system continuity

Uses the same tokens as the Workspace redesign and the screenshot set:

- Palette: `--as-surface-0/1`, `--as-glass-2`, teal `--as-accent-1`
- Type: IBM Plex Sans + JetBrains Mono
- Shell glow: radial gradients from `--as-glow-1`, `--as-glow-2`
- Single accent: teal is the only decorative color; status colors (good
  / warn / info) are not used on this page, which keeps the piece
  visually calm for print.

The hero screenshot embedded on the page is
[`docs/screenshots/renders/01-workspace.png`](../screenshots/renders/01-workspace.png)
from session 2 — if that screenshot changes, re-run
[`generate.mjs`](generate.mjs) and the one-pager picks it up.

## Content

- **Tagline:** "Your support team's second brain" (eyebrow) +
  "ML-powered answers from your own knowledge base — in under 25ms,
  without sending a single query to the cloud." (headline)
- **Five feature pillars:** ML intent classification · Sub-25ms hybrid
  search · Trust-gated responses · Self-improving feedback loop ·
  Local-first &amp; encrypted. Each pillar carries a one-line body and
  a small mono stat tag (e.g. `0.914 macro-F1`, `22ms p50`,
  `0.93 grounded · 0.96 faithful`).
- **Impact strip (3 columns):**
  - **25%** ticket deflection — benchmark from prior Aisera deployment
  - **<25ms** hybrid search p50 — measured on M3 MBP, eval run #4812
  - **3,500+** KB articles indexed — nightly reindex, 46s
- **Footer:** tech stack chips (Tauri 2 · React 19 · TypeScript · Rust
  · SQLCipher · Ollama · TF-IDF + MiniLM) plus repo URL.

## Regenerating

```bash
# from repo root
node docs/one-pager/generate.mjs
```

PDF is written at 11in × 8.5in landscape with `preferCSSPageSize: true`
so the CSS `@page` rule drives the sheet. Background colors are
preserved via `-webkit-print-color-adjust: exact`. PNG preview is
captured at 2× device pixel ratio (2112 × 1632) so the same source
file doubles as a web-ready hero image.

## What's next

Session 4 turns the one-pager positioning, the feature pillars, and the
screenshot set into a 12-slide deck for a LinkedIn Live titled
_Running a local-first support agent on a Mac_.
