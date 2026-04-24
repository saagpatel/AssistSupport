# Workspace Redesign — Acceptance Checklist

The implementing agent is done when every box below is checked. Items
are grouped so each group can be validated independently.

## Layout

- [ ] At viewport ≥ 1280px, the Workspace tab renders exactly three
      regions: composer (full width, sticky top), answer hero (left
      column), triage rail (right column, 340px fixed).
- [ ] At viewport 900–1279px, the rail narrows to 300px but stays in
      the right column.
- [ ] At viewport < 900px, the rail stacks below the answer column,
      composer stays sticky.
- [ ] At viewport < 640px, composer footer wraps: chips row above,
      length + generate row below.
- [ ] The composer stays pinned at the top while the answer scrolls.
- [ ] Answer column and rail scroll independently; neither causes
      the other to re-layout.

## Composer

- [ ] Ticket micro-header shows `{KEY} · {ISSUE_TYPE}` in monospace on
      the left, summary in the center, priority + auto-detected intent
      badge on the right.
- [ ] The blue→violet avatar gradient from `ClaudeDesignWorkspace` is
      not present anywhere in the new layout.
- [ ] Textarea min-height 104px, max-height before scroll 240px,
      `aria-label="Ticket or issue description"`.
- [ ] Intent chips are a `role="radiogroup"` of 4 options (Policy,
      Howto, Access, Incident); toggling writes `likely_category` to
      `caseIntake`.
- [ ] Length segmented control has 3 options (Short, Medium, Long) and
      is itself a `role="radiogroup"`.
- [ ] Generate button shows `⌘↵` kbd pill; becomes a Cancel button
      while `generating === true`.
- [ ] Generate is disabled when `!modelLoaded || !input.trim()` and the
      `title` attribute explains why.

## Answer hero

- [ ] Prose body renders at 16px / 1.65 IBM Plex Sans, clamped to
      `max-width: 70ch`.
- [ ] Paragraph gap is 14px.
- [ ] Inline `[n]` markers render as accent citation pills (same
      visual as `.cdw .cite`) and invoke `onNavigateToSource` with the
      source title or file path.
- [ ] Inline code and fenced code render in JetBrains Mono with the
      surfaces described in `SPEC.md §3`.
- [ ] Intent + confidence strip shows only when `confidence` is not
      null; tone switches on `confidence.mode` (answer/clarify/abstain).
- [ ] Metrics row shows tok/s, sources count, word count, context %,
      and claims-supported ratio, all with tabular numerals.
- [ ] When no response exists yet, the answer column shows the empty
      state helper text (see spec for copy).
- [ ] Streaming dot appears at the tail of the prose during streaming.
- [ ] Answer actions: Regenerate (ghost), Save template (ghost),
      spacer, Copy response (primary).
- [ ] Sources block is hidden when `sources.length === 0`, otherwise
      renders a vertical list of numbered rows that match the
      inline-citation numbering.

## Triage rail

- [ ] Workflow card is vertical, 4 steps; current step highlighted
      with `--as-accent-surface-1`, completed steps use
      `--as-good-surface`.
- [ ] Signals card shows confidence %, grounded-claims ratio + bar,
      retrieval latency if provided.
- [ ] Alternatives card is hidden when `alternatives.length === 0`.
      When shown, each alt has label `ALT N`, a clamped 2-line
      preview, and a "Use this" ghost button.
- [ ] Feedback card renders thumbs up / thumbs down buttons with
      `aria-pressed`; clicking invokes `onRateResponse` if provided.
- [ ] `Flag as KB gap` ghost button spans the full width of the
      feedback card and invokes `onFlagKbGap` if provided.
- [ ] Context card contains Audience, Tone, Urgency, Environment
      controls — these are **not** present anywhere else in the
      layout.
- [ ] Footer shows `loadedModelName` in monospace, context
      utilization %, and a small placeholder for the last-run
      timestamp.
- [ ] If the rail's content exceeds viewport height, the rail
      scrolls independently.

## Design system

- [ ] No new tokens are added to `src/styles/revamp/tokens.css`.
- [ ] The new CSS file only references tokens with the `--as-` prefix.
- [ ] Single accent: no fill, gradient, or outline in the layout uses
      purple, blue, magenta, or gradient decoration. Teal is the only
      accent; status colors (good/warn/bad/info) are only used to
      communicate status.
- [ ] `@media (prefers-reduced-motion: reduce)` collapses all
      transitions to 0ms (inherited from existing design-tokens.css).
- [ ] `@media (prefers-reduced-transparency: reduce)` still produces a
      readable layout (solid surfaces from the revamp shell rule).

## Accessibility

- [ ] All interactive elements show the shell's `:focus-visible`
      outline (`2px solid var(--as-focus)`, 2px offset).
- [ ] Confidence gauge exposes `aria-label` with percent + tone.
- [ ] Intent chips, length segmented, and rail thumbs expose correct
      `role`/`aria-checked`/`aria-pressed`.
- [ ] Answer prose passes axe with no new contrast violations
      introduced (`pnpm ui:test:a11y`).

## Quality gates

- [ ] `pnpm typecheck` passes.
- [ ] `pnpm lint` passes.
- [ ] `pnpm test` passes, including any new `WorkspaceHeroLayout.test.tsx`.
- [ ] `pnpm perf:workspace` passes with no new regressions.
- [ ] `pnpm health:repo` passes end-to-end before the PR is opened.

## Rollback

- [ ] `ClaudeDesignWorkspace.tsx` and its CSS still exist.
- [ ] Flipping `ASSISTSUPPORT_REVAMP_WORKSPACE_HERO` to `false`
      restores the previous layout without code changes.
