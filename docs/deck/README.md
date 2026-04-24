# LinkedIn Live Deck — Running a local-first support agent on a Mac

Session 4 of the AssistSupport portfolio pass. A 12-slide editable PPTX
deck plus a rendered PDF for preview / distribution.

## Output

| File                                                                 | Purpose                                              |
| -------------------------------------------------------------------- | ---------------------------------------------------- |
| [AssistSupport-LinkedIn-Live.pptx](AssistSupport-LinkedIn-Live.pptx) | Editable deck for PowerPoint / Keynote / Slides.     |
| [AssistSupport-LinkedIn-Live.pdf](AssistSupport-LinkedIn-Live.pdf)   | 12-page PDF render (via LibreOffice) for preview.    |
| [build.mjs](build.mjs)                                               | pptxgenjs composer — re-run to regenerate the deck.  |
| [package.json](package.json)                                         | Local deps (`pptxgenjs`) isolated from the app root. |

## Slide outline

| #   | Title                                                                     | Purpose                                                                           |
| --- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 01  | Running a local-first support agent on a Mac.                             | Title · speaker chip · positioning.                                               |
| 02  | IT support drowns in the same questions — and cloud AI isn't a clean fix. | The problem framing.                                                              |
| 03  | A second brain — not a replacement.                                       | Thesis: local-first · KB-grounded · trust-gated.                                  |
| 04  | The pipeline — five stages, all local.                                    | Architecture: intent → retrieve → rerank → draft → learn, with latency per stage. |
| 05  | The workspace — composer, answer, triage.                                 | Demo pause — hero screenshot + 3 annotated callouts.                              |
| 06  | Why logreg + TF-IDF beat embeddings here.                                 | ML intent classifier: F1, latency, inspectability.                                |
| 07  | Sub-25 ms retrieval over 3,500+ articles.                                 | Hybrid search: TF-IDF + MiniLM-L-6 cross-encoder, latency budget diagram.         |
| 08  | The model is allowed to say "I don't know."                               | Trust gating: answer / clarify / abstain modes.                                   |
| 09  | Low-confidence queries become the KB backlog.                             | Self-improving feedback loop with KB gap dashboard.                               |
| 10  | Yes, a desktop app needs a deploy story.                                  | Ops surface + eval harness side-by-side.                                          |
| 11  | Five things I didn't expect.                                              | Lessons — UX, prompt cache, logreg, Tauri, feedback.                              |
| 12  | Questions?                                                                | Resources · repo · connect · tech-stack line.                                     |

Every slide includes **speaker notes** for the Live — shown in the
Presenter View off-screen. The notes cover timing cues, pivot points,
and the audience-specific call-outs the speaker should make.

## Design-system continuity

Same tokens as the Workspace redesign, the screenshot set, and the
one-pager:

- Background: `#0B0D10` (warm graphite)
- Accent: teal `#4FD1C5` — the only decorative color
- Status colors (good / warn / bad / info) used only on slide 08
  (trust-gated modes) where the three borders actually carry meaning
- Type: IBM Plex Sans + JetBrains Mono (named font — the deck will
  fall back cleanly on machines without them installed)
- Thin teal hairline across the top of every slide + subtle border
  strip along the bottom — mirrors the active-nav indicator in the
  app shell
- Slide number chip (`01 / 12`) in the top-right of every slide, in
  JetBrains Mono with teal accent on the current number

The demo slides (05, 06, 09, 10) embed the portfolio screenshots
directly from [`docs/screenshots/renders/`](../screenshots/renders/), so any
re-run of session 2 flows through to the deck on the next `build.mjs`
invocation.

## Editable slides

The deck is built with `pptxgenjs` using native text boxes + shapes +
embedded PNGs — **not** image-background slides. A speaker can open
the .pptx in PowerPoint, Keynote, or Google Slides and:

- Edit any title or bullet text directly
- Swap the speaker chip on slide 01
- Replace individual screenshots without rebuilding
- Re-time the talk by adding or removing slides

This is deliberate — a LinkedIn Live rehearsal almost always surfaces
wording tweaks, and painting slides onto images would block that.

## Regenerating

```bash
cd docs/deck
npm run build
# optional: render a PDF preview
soffice --headless --convert-to pdf AssistSupport-LinkedIn-Live.pptx
```

`pptxgenjs` is installed locally under `docs/deck/node_modules/` so it
never pollutes the app's root `package.json`. The LibreOffice PDF step
is optional — PowerPoint itself can export to PDF if preferred.

## Portfolio pass — summary

Session 4 closes the AssistSupport portfolio pass. The four artifacts
read as a coherent product:

1. **Session 1** — [Workspace redesign handoff bundle](../redesign/README.md): 3-region hero layout as React + CSS drop-in, behind a feature flag, zero new tokens.
2. **Session 2** — [6-panel 2× screenshot set](../screenshots/README.md) + captions: portfolio-grade PNGs of the live product surfaces.
3. **Session 3** — [Landscape-letter one-pager PDF](../one-pager/README.md): tagline, five feature pillars, three impact stats.
4. **Session 4** — this deck: 12 slides for the LinkedIn Live walkthrough.

One design system spans all four: warm-graphite surfaces, teal accent,
IBM Plex Sans + JetBrains Mono, tokens sourced from
[`src/styles/revamp/tokens.css`](../../src/styles/revamp/tokens.css).
If that token file shifts, every artifact re-syncs from the same
source.
