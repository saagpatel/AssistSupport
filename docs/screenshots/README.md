# Portfolio Screenshot Set

Session 2 of the AssistSupport portfolio pass. Six 2× panels that
document the product at a portfolio level — each rendered from a
self-contained HTML mockup, using the same token set
([tokens.css](../../src/styles/revamp/tokens.css)) as the live app, so
the captures stay visually consistent with the redesigned Workspace.

## Panels

| #   | Source                                               | PNG                                              | Caption file                      |
| --- | ---------------------------------------------------- | ------------------------------------------------ | --------------------------------- |
| 1   | [panels/01-workspace.html](panels/01-workspace.html) | [out/01-workspace.png](renders/01-workspace.png) | see [CAPTIONS.md](CAPTIONS.md) §1 |
| 2   | [panels/02-queue.html](panels/02-queue.html)         | [out/02-queue.png](renders/02-queue.png)         | [CAPTIONS.md](CAPTIONS.md) §2     |
| 3   | [panels/03-intent.html](panels/03-intent.html)       | [out/03-intent.png](renders/03-intent.png)       | [CAPTIONS.md](CAPTIONS.md) §3     |
| 4   | [panels/04-kb-gap.html](panels/04-kb-gap.html)       | [out/04-kb-gap.png](renders/04-kb-gap.png)       | [CAPTIONS.md](CAPTIONS.md) §4     |
| 5   | [panels/05-ops.html](panels/05-ops.html)             | [out/05-ops.png](renders/05-ops.png)             | [CAPTIONS.md](CAPTIONS.md) §5     |
| 6   | [panels/06-eval.html](panels/06-eval.html)           | [out/06-eval.png](renders/06-eval.png)           | [CAPTIONS.md](CAPTIONS.md) §6     |

Plus a combined 2×3 contact sheet:
[out/contact-sheet.png](renders/contact-sheet.png) (2880×2700).

## How they're rendered

Each panel is a single HTML file that:

- Loads [`shell.css`](shell.css) — a direct subset of the live app's
  revamp token set and shell chrome. No build step, no bundler.
- Uses IBM Plex Sans + JetBrains Mono from Google Fonts (the same two
  families the live app loads via `@fontsource-variable`).
- Seeds realistic IT-support data (Jira-style ticket IDs, intent
  classes, retrieval latencies, eval scores) so the screenshots read
  as the product rather than a mockup.

The capture script ([`capture.mjs`](capture.mjs)) launches headless
Chromium via `@playwright/test` (already in devDependencies), renders
each HTML at 1440×900 CSS / 2× DPR, and writes a 2880×1800 PNG per
panel plus the contact sheet.

## Re-running the capture

```bash
# from repo root
node docs/screenshots/capture.mjs
```

No additional install step needed — Playwright + the Chromium binary
are already cached via the devDependency.

## Design system reuse

Every panel uses only the `--as-*` tokens from the live app:

- Surfaces: `--as-surface-0/1/2/3`, `--as-glass-1/2/3`
- Text: `--as-text-1/2/3`
- Accent: `--as-accent-1/2`, `--as-accent-surface-1`, `--as-accent-border-1`
- Status: `--as-good/warn/bad/info` families
- Type: `--as-font-sans`, `--as-font-mono`
- Shell glow: `--as-glow-1/2`

No new tokens are introduced. If the tokens in the live app change,
`shell.css` is the single place to re-sync.

## What's next

Session 3 turns the hero screenshot ([01-workspace.png](renders/01-workspace.png))
and the contact sheet into a landscape-letter one-pager PDF with the
tagline, five feature pillars, and the impact-stats strip.
