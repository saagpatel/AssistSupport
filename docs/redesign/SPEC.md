# Workspace Redesign — Layout + Visual Spec

Reference spec for `WorkspaceHeroLayout.tsx` + `workspaceHero.css`.
Scope: the Workspace (Draft) tab only. Shell, Queue, Knowledge, Ops,
Analytics, and Settings tabs are unchanged.

## 1. Grid geometry

Desktop viewport ≥ 1280px:

| Region      | Row | Column     | Size                  |
| ----------- | --- | ---------- | --------------------- |
| Composer    | 1   | full width | `auto` height, sticky |
| Answer hero | 2   | col 1      | `minmax(0, 1fr)`      |
| Triage rail | 2   | col 2      | `340px` fixed         |

Column gap: `24px`. Composer bottom margin: `20px`. Main container
horizontal padding: `28px`. Overall `cdw`-style scroll container is
removed; the answer column and rail scroll independently so the
composer stays in view during long drafts.

Breakpoints:

- `≥1280px` — 3-region layout as above.
- `900–1279px` — rail collapses to `300px`; composer stays full width.
- `<900px` — rail stacks below answer column (`grid-template-columns: 1fr`), composer stays sticky.
- `<640px` — composer footer wraps: chips row above, length + generate row below.

## 2. Composer region

Sticky top of the scroll container. Background uses `--as-glass-2`
with a `--backdrop-blur: 12px` to visually separate it from the
scrolling answer.

Children (top-to-bottom):

1. **Ticket micro-header** (single row, 32px tall)
   - Left: `AS-4218 · REQUEST` (monospace, 11px, uppercase, `--as-text-3`)
   - Center: ticket summary (14px / 1.3 semibold, truncated)
   - Right: priority badge + auto-detected intent badge
   - The blue→violet avatar gradient from `ClaudeDesignWorkspace` is
     removed; if an avatar is rendered it uses a solid
     `--as-accent-surface-1` background with accent-1 text.
2. **Query field** (textarea, 104px min height, 240px max height before scroll, 15px / 1.5)
3. **Composer footer** (flex row)
   - Left: intent chip row (`.wsx__chips` — same visual language as
     `.cdw .chip`)
   - Right: response-length segmented control + Generate button with
     `⌘↵` kbd pill. When generating, replaced by Cancel button.

## 3. Answer hero region

Center column. Max inner content width: `720px`, centered within the
column so the prose never exceeds 70ch. Outer column has the full
1fr width so the right rail can sit flush.

Vertical stack:

1. **Intent + confidence strip** (when a confidence object exists)
   - Height 48px, single row
   - Left: `ML INTENT` label (11px mono, letter-spacing 1px, uppercase)
     - derived intent class (e.g. `policy / removable_media`)
   - Right: confidence gauge (`Grounded` / `Needs clarify` / `Abstain`
     pill + horizontal bar + numeric percent, tabular-nums)
   - Tone switches on `confidence.mode`: answer → good, clarify → warn,
     ood → bad
2. **Metrics row** (tok/s · sources · words · ctx util · claims supported · model name)
   - 11.5px, all metrics use monospace numerals
3. **Answer prose**
   - 16px / 1.65 IBM Plex Sans
   - `max-width: 70ch`
   - Paragraph gap: 14px
   - H2 inside draft: 17px / 1.35 semibold, 24px top margin, 6px bottom
   - H3 inside draft: 15px / 1.4 semibold
   - Inline code: JetBrains Mono 14px / 1.45 on `rgba(255, 255, 255, 0.04)` with `--as-radius-1` and 2px/4px padding
   - Fenced code: JetBrains Mono 13.5px / 1.55 on `--as-glass-3`, 12px padding, `--as-radius-2`
   - Citation pills: 11px mono, `--as-accent-surface-1` background,
     `--as-accent-border-1` border, `--as-accent-1` text, 4px radius,
     2px horizontal margin. Same visual as `.cdw .cite`.
   - Empty state (no draft yet): 320px min height, centered helper text
     at 14px `--as-text-3`.
4. **Answer actions** (bottom of prose block)
   - Flex row: Regenerate (ghost), Save template (ghost), spacer, Copy response (primary)
5. **Sources block**
   - Heading: `Cited sources · click to open` (12px semibold)
   - Vertical list of `.wsx__source` rows (numbered pill + title + path + score)
   - Behaves like `.cdw .source` but the number pill uses the same
     typography as inline citations so they visually connect.

Streaming dot matches existing `.streaming-dot` semantics — 7px accent
disc with 1.2s pulse.

## 4. Triage rail region

Right column. Width `340px` at ≥1280px, `300px` at 900–1279px, full
width stacked below the answer at <900px.

Vertical stack (each block is a `.wsx__railCard` with 14px padding, 12px gap between cards):

1. **Workflow progress (vertical)**
   - Replaces the horizontal `.ws-strip` from `ClaudeDesignWorkspace`.
   - 4 steps (Triage · Classify · Draft · Send to Jira), each shown
     as a row with a 20px numbered circle and a label + short status.
   - Current step highlighted with `--as-accent-surface-1` background,
     completed steps use `--as-good-surface` number circle.
2. **Signals**
   - Confidence summary (the same numeric %, shown smaller: 20px mono semibold)
   - Grounded claims: `{supported}/{total} claims supported` with a
     horizontal mini-bar.
   - Retrieval latency: `{ms}ms hybrid search` (monospace).
3. **Alternatives**
   - Hidden when `alternatives.length === 0`.
   - Stacked vertically instead of horizontal chips.
   - Each alt: label `ALT 1` (10px mono uppercase) + first 120 chars of
     preview (12px / 1.35) + "Use this" ghost button.
4. **Feedback**
   - Thumbs up / thumbs down buttons (36x36, accent when selected).
   - `Flag as KB gap` ghost button full width beneath the thumbs row.
   - Optional 1-line comment field that appears after a thumb is clicked.
5. **Context**
   - Audience + Tone + Urgency + Environment selects. These move out of
     the answer column (where the current design puts them in a
     "Context" panel) and into the rail so the answer column is prose-only.
6. **Model / perf footer**
   - `loadedModelName` in monospace, context utilization %, last-run
     timestamp. Small, 11px, `--as-text-3`.

The rail never exceeds the viewport height; if the combined cards
overflow it scrolls independently of the answer column.

## 5. Typography tokens used

| Role                | Family           | Size   | Line | Weight | Tracking |
| ------------------- | ---------------- | ------ | ---- | ------ | -------- |
| Answer prose        | `--as-font-sans` | 16px   | 1.65 | 400    | normal   |
| Answer prose strong | `--as-font-sans` | 16px   | 1.65 | 600    | normal   |
| Answer H2           | `--as-font-sans` | 17px   | 1.35 | 600    | -0.1px   |
| Answer H3           | `--as-font-sans` | 15px   | 1.4  | 600    | normal   |
| Inline code         | `--as-font-mono` | 14px   | 1.45 | 400    | 0        |
| Fenced code         | `--as-font-mono` | 13.5px | 1.55 | 400    | 0        |
| Citation pill       | `--as-font-mono` | 11px   | 1    | 600    | 0.4px    |
| Ticket summary      | `--as-font-sans` | 14px   | 1.3  | 600    | -0.1px   |
| Ticket id           | `--as-font-mono` | 11px   | 1.2  | 500    | 0.4px    |
| Composer textarea   | `--as-font-sans` | 15px   | 1.5  | 400    | 0        |
| Chip                | `--as-font-sans` | 11.5px | 1.2  | 500    | 0        |
| Segmented           | `--as-font-sans` | 12px   | 1    | 500    | 0        |
| Rail card title     | `--as-font-sans` | 12px   | 1.2  | 600    | 0.3px    |
| Rail stat value     | `--as-font-mono` | 20px   | 1    | 600    | tabular  |
| Rail label          | `--as-font-sans` | 11px   | 1.2  | 500    | 0.2px    |
| Footer meta         | `--as-font-mono` | 11px   | 1.3  | 400    | 0        |

## 6. Color discipline

Single accent: teal `--as-accent-1` (`#4fd1c5`). No gradient
decorations anywhere in the redesign. Specifically:

- Ticket avatar uses `--as-accent-surface-1` background with
  `--as-accent-1` initials instead of the `linear-gradient(135deg,
#60a5fa, #a78bfa)` from the current design.
- Confidence bar uses `linear-gradient(90deg, var(--as-good),
var(--as-accent-1))` **only when** confidence mode is `answer`. In
  `clarify` it uses a solid `--as-warn`, in `abstain` a solid `--as-bad`.
- Panel backgrounds never use accent fills; accent is reserved for
  interactive affordances (chip-on, primary button, citation pills,
  gauge bar, focus ring).

Status colors `--as-good`, `--as-warn`, `--as-bad`, `--as-info` remain
functional-only (confidence tone, KB-gap flag, error toast, info
badges).

## 7. Motion

All transitions use `150ms ease`:

- Chip on/off
- Button hover
- Textarea focus

Streaming dot: existing 1.2s pulse from `.cdw .streaming-dot`.

Rail cards fade-slide in 120ms when their underlying data first
populates (`opacity: 0 → 1`, `transform: translateY(4px) → 0`). No
entrance animation on composer or answer — they're always present.

Honors `@media (prefers-reduced-motion: reduce)` — all motion collapses
to 0ms via the existing rule in `design-tokens.css`.

## 8. Accessibility

- Composer textarea has `aria-label="Ticket or issue description"`.
- Intent chips and length segmented control use `role="radiogroup"` with
  `role="radio"` + `aria-checked`, same as the current
  `ClaudeDesignWorkspace`.
- Confidence gauge has `aria-label` announcing the percent and tone.
- Citation pills are `<button>` elements with `title` of the source
  name (existing pattern preserved).
- Sources list items are `<button>` for keyboard navigation.
- Rail thumbs up / down buttons have `aria-pressed` state.
- All interactive elements retain the `:focus-visible` outline from
  `revampShell.css` (`2px solid var(--as-focus)`, 2px offset).

## 9. Data contract

`WorkspaceHeroLayout` takes exactly the same props as
`ClaudeDesignWorkspace`:

```ts
export interface WorkspaceHeroLayoutProps {
  ticket: JiraTicket | null;
  ticketId: string | null;
  input: string;
  onInputChange: (value: string) => void;
  responseLength: ResponseLength;
  onResponseLengthChange: (length: ResponseLength) => void;
  hasInput: boolean;
  hasDiagnosis: boolean;
  hasResponseReady: boolean;
  handoffTouched: boolean;
  response: string;
  streamingText: string;
  isStreaming: boolean;
  sources: ContextSource[];
  metrics: GenerationMetrics | null;
  confidence: ConfidenceAssessment | null;
  grounding: GroundedClaim[];
  alternatives: ResponseAlternative[];
  generating: boolean;
  modelLoaded: boolean;
  loadedModelName: string | null;
  caseIntake: CaseIntake;
  onIntakeFieldChange: (
    field: "note_audience" | "likely_category" | "urgency" | "environment",
    value: string | null,
  ) => void;
  onGenerate: () => void;
  onCancel: () => void;
  onCopyResponse: () => void;
  onSaveAsTemplate: () => void;
  onUseAlternative: (alt: ResponseAlternative) => void;
  onNavigateToSource?: (searchQuery: string) => void;
  /** NEW — optional. Wires the rail feedback controls. */
  onRateResponse?: (rating: "up" | "down") => void;
  onFlagKbGap?: () => void;
  retrievalLatencyMs?: number | null;
}
```

The three new props are **optional** so the component is a drop-in
replacement even if the feedback wiring is not yet implemented — the
rail will still render the feedback UI, but clicks will no-op.

## 10. Non-goals

- No change to the Queue, Knowledge, Analytics, Ops, or Settings tabs.
- No change to tokens, shell chrome, command palette, onboarding, or
  keyboard shortcuts.
- No new dependencies. No Tailwind, no CSS-in-JS, no animation library.
- No change to test harness or Playwright snapshots — existing Draft
  tests should be rerun against the new component once it is wired.
