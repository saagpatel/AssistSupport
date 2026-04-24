# AssistSupport Portfolio Pass

Single entry point for the four-session portfolio build. Everything in
this folder is meta-documentation — the actual artifacts live in their
respective session folders and are linked below.

## The four artifacts

| #   | Artifact                                        | Session folder                                  | Primary output                                                                                 |
| --- | ----------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 1   | Workspace redesign — Claude Code handoff bundle | [`docs/redesign/`](../redesign/README.md)       | [`WorkspaceHeroLayout.tsx`](../../src/features/workspace/WorkspaceHeroLayout.tsx) + CSS + spec |
| 2   | 6-panel 2× portfolio screenshot set             | [`docs/screenshots/`](../screenshots/README.md) | Six 2880×1800 PNGs + 2×3 contact sheet + captions                                              |
| 3   | Landscape-letter one-pager PDF                  | [`docs/one-pager/`](../one-pager/README.md)     | [`AssistSupport-one-pager.pdf`](../one-pager/AssistSupport-one-pager.pdf) (11in × 8.5in)       |
| 4   | 12-slide LinkedIn Live deck                     | [`docs/deck/`](../deck/README.md)               | [`AssistSupport-LinkedIn-Live.pptx`](../deck/AssistSupport-LinkedIn-Live.pptx) + PDF preview   |

## Shared design system

All four artifacts consume the same token set from the live app —
[`src/styles/revamp/tokens.css`](../../src/styles/revamp/tokens.css).
No artifact introduces new tokens.

| Role            | Token / value                                           |
| --------------- | ------------------------------------------------------- |
| Background      | `--as-surface-0` `#0B0D10` → `--as-surface-1` `#0F1218` |
| Surfaces        | `--as-glass-1/2/3` translucent panels                   |
| Border          | `--as-border-1/2`                                       |
| Text            | `--as-text-1/2/3` (opacity ramps from 0.92 to 0.56)     |
| Accent (single) | `--as-accent-1` teal `#4FD1C5`                          |
| Status          | `--as-good/warn/bad/info` — functional only             |
| Headings / body | IBM Plex Sans                                           |
| Code / metrics  | JetBrains Mono                                          |
| Shell glow      | `--as-glow-1/2` radial gradients                        |

The design rule across every artifact: **teal is the only decorative
color.** Status colors carry meaning (confidence tone, release-gate
status, KB-gap flags) but are never used for decoration.

## How the pieces connect

```
      ┌────────────────────────────────────────────────┐
      │  tokens.css  (live app · single source)        │
      └──────────────────────────┬─────────────────────┘
                                 │
         ┌───────────────────────┼──────────────────────┐
         │                       │                      │
         ▼                       ▼                      ▼
  Session 1                Session 2                Session 4
  Workspace redesign  ───► Screenshot set  ───►  LinkedIn Live deck
  (new React + CSS)        (6 × 2× PNGs)         (embeds the PNGs)
                                 │
                                 ▼
                           Session 3
                           One-pager PDF
                           (embeds panel 01 as hero)
```

If the workspace redesign lands on master, re-running session 2's
capture script regenerates every screenshot; sessions 3 and 4 then
pick up the new screenshots on their next build. The whole portfolio
re-syncs from a single source.

## Voice

Engineering-professional across all four artifacts:

- No emojis
- No marketing superlatives
- Specific numbers: `22 ms p50`, `0.914 macro-F1`, `3,500+ articles`,
  `25% deflection`, `90-second rollback SLO`
- Pronouns first-person singular only in the deck (sessions 1–3 are
  product-voice, session 4 is speaker-voice)
- Citations are real — every number traces back to either the README,
  the eval harness, or a prior production benchmark

## Regeneration commands

```bash
# Session 1 — verify handoff bundle compiles
pnpm install
pnpm ui:typecheck

# Session 2 — rerender six panels + contact sheet
node docs/screenshots/capture.mjs

# Session 3 — rerender one-pager PDF + PNG preview
node docs/one-pager/generate.mjs

# Session 4 — rebuild the PPTX (+ optional PDF)
cd docs/deck && npm run build
soffice --headless --convert-to pdf AssistSupport-LinkedIn-Live.pptx
```

## Inventory

```
docs/
├── portfolio/
│   └── README.md                         ← this file
├── redesign/
│   ├── README.md
│   ├── SPEC.md
│   ├── INTEGRATION.md
│   └── ACCEPTANCE.md
├── screenshots/
│   ├── README.md
│   ├── CAPTIONS.md
│   ├── shell.css
│   ├── capture.mjs
│   ├── panels/
│   │   ├── 01-workspace.html
│   │   ├── 02-queue.html
│   │   ├── 03-intent.html
│   │   ├── 04-kb-gap.html
│   │   ├── 05-ops.html
│   │   └── 06-eval.html
│   └── out/
│       ├── 01-workspace.png              (2880 × 1800)
│       ├── 02-queue.png                  (2880 × 1800)
│       ├── 03-intent.png                 (2880 × 1800)
│       ├── 04-kb-gap.png                 (2880 × 1800)
│       ├── 05-ops.png                    (2880 × 1800)
│       ├── 06-eval.png                   (2880 × 1800)
│       └── contact-sheet.png             (2880 × 2700)
├── one-pager/
│   ├── README.md
│   ├── one-pager.html
│   ├── generate.mjs
│   ├── AssistSupport-one-pager.pdf       (11in × 8.5in landscape)
│   └── AssistSupport-one-pager.png       (2112 × 1632 preview)
└── deck/
    ├── README.md
    ├── build.mjs
    ├── package.json
    ├── AssistSupport-LinkedIn-Live.pptx  (editable, 12 slides)
    └── AssistSupport-LinkedIn-Live.pdf   (PDF preview)

src/
├── features/workspace/
│   └── WorkspaceHeroLayout.tsx           (new, drop-in for ClaudeDesignWorkspace)
└── styles/revamp/
    └── workspaceHero.css                 (new, scoped under .wsx)
```
