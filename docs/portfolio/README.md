# AssistSupport Portfolio Pass

Single entry point for the four-session portfolio build plus the
follow-on artifacts. Everything in this folder is
meta-documentation — the actual assets live in their respective
session folders and are linked below.

## The four primary artifacts

| #   | Artifact                                        | Session folder                                  | Primary output                                                                                 |
| --- | ----------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 1   | Workspace redesign — Claude Code handoff bundle | [`docs/redesign/`](../redesign/README.md)       | [`WorkspaceHeroLayout.tsx`](../../src/features/workspace/WorkspaceHeroLayout.tsx) + CSS + spec |
| 2   | 6-panel 2× portfolio screenshot set             | [`docs/screenshots/`](../screenshots/README.md) | Six 2880×1800 PNGs + 2×3 contact sheet + captions                                              |
| 3   | Landscape-letter one-pager PDF                  | [`docs/one-pager/`](../one-pager/README.md)     | [`AssistSupport-one-pager.pdf`](../one-pager/AssistSupport-one-pager.pdf) (11in × 8.5in)       |
| 4   | 12-slide LinkedIn Live deck                     | [`docs/deck/`](../deck/README.md)               | [`AssistSupport-LinkedIn-Live.pptx`](../deck/AssistSupport-LinkedIn-Live.pptx) + PDF preview   |

## Supporting artifacts

| Artifact                                   | Location                                                               | Purpose                                                                                     |
| ------------------------------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Case study — three architectural decisions | [`docs/case-study.md`](../case-study.md)                               | Long-form writeup on logreg · hybrid retrieval · trust-gated. Evergreen portfolio piece.    |
| LinkedIn Live rehearsal kit                | [`docs/deck/REHEARSAL.md`](../deck/REHEARSAL.md)                       | 40-min budget, slide-by-slide cues, Q&A matrix, dry-run checklist.                          |
| 90-second demo video storyboard            | [`docs/deck/DEMO-VIDEO.md`](../deck/DEMO-VIDEO.md)                     | 7-shot storyboard + verbatim narration for an async demo reel.                              |
| Live-capture pipeline                      | [`docs/screenshots/live-capture.mjs`](../screenshots/live-capture.mjs) | Spawns dev server + Playwright, captures 4 real-app panels.                                 |
| Enriched Tauri IPC mock                    | [`src/test/e2eTauriMock.ts`](../../src/test/e2eTauriMock.ts)           | Portfolio-grade seed data (3 artifacts, 4 runs, 3 eval runs, 5 triage clusters, 5 KB gaps). |

## Shared design system

All artifacts consume the same token set from the live app —
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
  (React + CSS,            (live captures           (embeds the PNGs,
   behind flag)             + HTML mockups)          speaker notes +
                                 │                   rehearsal kit)
                                 ▼
                           Session 3
                           One-pager PDF
                           (embeds panel 01 as hero)
                                 │
                                 ▼
                          Case study
                          (three architectural
                           decisions, long-form)
```

If the workspace redesign ships on master, re-running session 2's
live-capture script regenerates every screenshot; sessions 3, 4, and
the case study then pick up the new screenshots on their next build.
The whole portfolio re-syncs from a single source.

## Voice

Engineering-professional across all artifacts:

- No emojis
- No marketing superlatives
- Specific numbers: `22 ms p50`, `0.914 macro-F1`, `3,500+ articles`,
  `25% deflection`, `90-second rollback SLO`
- Pronouns first-person singular only in the deck + case study
  (sessions 1–3 are product-voice)
- Citations are real — every number traces back to either the README,
  the eval harness, or a prior production benchmark

## Regeneration commands

```bash
# Session 1 — verify handoff bundle compiles
pnpm install
pnpm ui:typecheck
pnpm lint
pnpm test  # 266 tests including WorkspaceHeroLayout.test.tsx

# Session 2 — live captures (real app) or HTML mockups
node docs/screenshots/live-capture.mjs      # panels 01/02/04/05 from running dev server
node docs/screenshots/capture.mjs           # all 6 from HTML mockups
node docs/screenshots/rebuild-contact-sheet.mjs  # re-stitch after mixing

# Session 3 — rerender one-pager PDF + PNG preview
node docs/one-pager/generate.mjs

# Session 4 — rebuild the PPTX (optional PDF via LibreOffice)
cd docs/deck && npm run build
soffice --headless --convert-to pdf AssistSupport-LinkedIn-Live.pptx
```

## Inventory

```
docs/
├── portfolio/
│   └── README.md                         ← this file
├── case-study.md                         ← long-form writeup (three decisions)
├── redesign/
│   ├── README.md · SPEC.md · INTEGRATION.md · ACCEPTANCE.md
├── screenshots/
│   ├── README.md · CAPTIONS.md · shell.css
│   ├── capture.mjs                       ← HTML-mockup renderer
│   ├── live-capture.mjs                  ← real-app capture pipeline
│   ├── rebuild-contact-sheet.mjs
│   ├── panels/*.html                     ← 6 HTML mockups
│   └── renders/
│       ├── 01-workspace.png              (2880 × 1800, live)
│       ├── 02-queue.png                  (2880 × 1800, live)
│       ├── 03-intent.png                 (2880 × 1800, mockup)
│       ├── 04-kb-gap.png                 (2880 × 1800, live)
│       ├── 05-ops.png                    (2880 × 1800, live)
│       ├── 06-eval.png                   (2880 × 1800, mockup)
│       └── contact-sheet.png             (2880 × 2700)
├── one-pager/
│   ├── README.md · one-pager.html · generate.mjs
│   ├── AssistSupport-one-pager.pdf       (11in × 8.5in landscape)
│   └── AssistSupport-one-pager.png       (2112 × 1632 preview)
└── deck/
    ├── README.md · build.mjs · package.json
    ├── REHEARSAL.md                      ← timing + Q&A prep
    ├── DEMO-VIDEO.md                     ← 90s storyboard + narration
    ├── AssistSupport-LinkedIn-Live.pptx  (editable, 12 slides · gitignored, rebuild via npm run build)
    └── AssistSupport-LinkedIn-Live.pdf   (PDF preview)

src/
├── features/workspace/
│   ├── WorkspaceHeroLayout.tsx           (new, drop-in for ClaudeDesignWorkspace)
│   └── WorkspaceHeroLayout.test.tsx      (smoke coverage)
├── styles/revamp/
│   └── workspaceHero.css                 (new, scoped under .wsx)
├── features/revamp/
│   ├── flags.ts                          (adds ASSISTSUPPORT_REVAMP_WORKSPACE_HERO)
│   └── shell/RevampShell.tsx             (collapses shell rail when hero is on)
└── test/
    └── e2eTauriMock.ts                   (portfolio-grade seed data)
```
