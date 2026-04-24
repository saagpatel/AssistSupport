# Workspace Redesign — Claude Code Handoff Bundle

Session 1 of the AssistSupport portfolio pass. This bundle redesigns the
primary Workspace (Draft) screen so the **AI-drafted answer** becomes the
hero surface of the application, and the composer and triage/feedback
controls are organized around it.

## What this bundle replaces

Today the Draft tab is rendered by
[`ClaudeDesignWorkspace.tsx`](../../src/features/workspace/ClaudeDesignWorkspace.tsx),
which uses a two-column grid (Query + Context | Response + Sources +
Alternatives). Both columns have roughly equal visual weight, the answer
body is 13.5px, and feedback/rating controls are scattered across the
right column together with citations.

This redesign introduces a drop-in replacement,
[`WorkspaceHeroLayout.tsx`](../../src/features/workspace/WorkspaceHeroLayout.tsx),
with a three-region geometry:

```
┌──────────────────────────────────────────────────────────────┐
│ COMPOSER  (sticky, full-width)                               │
│   ticket micro-header · textarea · intent chips · length · ⌘↵│
├──────────────────────────────────────────┬───────────────────┤
│                                          │                   │
│  ANSWER HERO  (center, readable column)  │   TRIAGE RAIL     │
│    · intent + confidence gauge            │   · workflow     │
│    · AI draft (16px / 1.65, 70ch)         │   · signals      │
│    · inline [n] citations                 │   · alternatives │
│    · sources cited (beneath draft)        │   · feedback     │
│    · regenerate · copy · save template    │   · model/perf   │
│                                          │                   │
└──────────────────────────────────────────┴───────────────────┘
```

The answer column and the right rail scroll independently; the composer
stays sticky at the top of the viewport while the operator scrolls
through a long multi-paragraph draft.

## Why these changes

1. **Readability-first hero.** The AI-drafted answer is what the
   operator will actually paste into Jira. The redesign lifts body text
   from 13.5px / 1.55 to 16px / 1.65 and clamps line length to 70ch so
   multi-paragraph drafts read like prose rather than a form field.
2. **Clear quality loop.** Confidence, grounded-claims breakdown,
   alternatives, rating capture, and KB-gap flag are consolidated into a
   single right rail — the feedback loop lives in one place instead of
   being mixed in with citations.
3. **Sources stay next to the draft.** Citations and their numbered
   source list live in the answer column so `[1]`, `[2]` markers remain
   within eye-tracking distance of the source entries.
4. **Single-accent discipline.** The redesign drops the
   blue→violet avatar gradient from the old ticket card and pushes all
   decoration through the teal accent (`--as-accent-1`). Status colors
   (good / warn / bad / info) remain functional-only.

## What ships in this bundle

| Path                                                                                                     | Purpose                                                           |
| -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| [`docs/redesign/README.md`](./README.md)                                                                 | This overview.                                                    |
| [`docs/redesign/SPEC.md`](./SPEC.md)                                                                     | Layout spec, typography scale, component inventory, a11y.         |
| [`docs/redesign/INTEGRATION.md`](./INTEGRATION.md)                                                       | How to wire the new component into `DraftTab.tsx`.                |
| [`docs/redesign/ACCEPTANCE.md`](./ACCEPTANCE.md)                                                         | Acceptance checklist for the implementing agent.                  |
| [`src/features/workspace/WorkspaceHeroLayout.tsx`](../../src/features/workspace/WorkspaceHeroLayout.tsx) | The new 3-region renderer. Same props as `ClaudeDesignWorkspace`. |
| [`src/styles/revamp/workspaceHero.css`](../../src/styles/revamp/workspaceHero.css)                       | Styles scoped under `.wsx`.                                       |

The existing `ClaudeDesignWorkspace.tsx` and its CSS are **left in
place** so the redesign can ship behind a flag and be A/B'd or rolled
back without a git revert.

## Design system continuity

This redesign reuses the existing revamp token set
([`src/styles/revamp/tokens.css`](../../src/styles/revamp/tokens.css))
unchanged. No new tokens are introduced and no existing tokens are
renamed. The new CSS only consumes:

- `--as-surface-*`, `--as-border-*`, `--as-text-*`
- `--as-glass-1/2/3`
- `--as-accent-1/2` + `--as-accent-surface-1` + `--as-accent-border-1`
- `--as-good/warn/bad/info-*`
- `--as-font-sans`, `--as-font-mono`
- `--as-space-*`, `--as-radius-*`, `--as-shadow-1`, `--as-focus`

This keeps the new screen visually identical in palette and rhythm to
the rest of the revamped shell (Queue / Knowledge / Analytics / Ops /
Settings) and means the same shell continues to cover accent swap,
density swap, and reduced-transparency media queries.

## Next sessions (context for the implementing agent)

This bundle is the first of four coordinated deliverables for the
AssistSupport portfolio pass:

1. **Session 1 (this bundle)** — Workspace redesign.
2. **Session 2** — 6-panel screenshot set.
3. **Session 3** — Landscape-letter one-pager PDF.
4. **Session 4** — 12-slide LinkedIn Live deck.

All four share the same design system: teal accent, warm-graphite dark
surfaces, IBM Plex Sans + JetBrains Mono. When the implementing agent
works on sessions 2-4 the screenshots will be captured from the UI
produced here, so any deviation from the spec in this bundle will
propagate into the collateral.
