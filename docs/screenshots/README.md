# Portfolio Screenshot Set

Session 2 of the AssistSupport portfolio pass. Six 2× panels that
document the product at a portfolio level. Each panel has **two
rendering paths** — a real-app live capture and a token-faithful HTML
mockup — and the PNG that currently ships under `renders/` is whichever
reads better for portfolio purposes. Both paths share the same
[`--as-*` tokens](../../src/styles/revamp/tokens.css) so the visual
language stays consistent across the set.

## Panels

| #   | PNG under `renders/`                         | Source                                         | Rendered from                 |
| --- | -------------------------------------------- | ---------------------------------------------- | ----------------------------- |
| 1   | [01-workspace.png](renders/01-workspace.png) | [live-capture.mjs](live-capture.mjs)           | **Live app** (hero flag on)   |
| 2   | [02-queue.png](renders/02-queue.png)         | [live-capture.mjs](live-capture.mjs)           | **Live app** (Queue tab)      |
| 3   | [03-intent.png](renders/03-intent.png)       | [panels/03-intent.html](panels/03-intent.html) | Mockup — no dedicated UI yet  |
| 4   | [04-kb-gap.png](renders/04-kb-gap.png)       | [live-capture.mjs](live-capture.mjs)           | **Live app** (Analytics tab)  |
| 5   | [05-ops.png](renders/05-ops.png)             | [live-capture.mjs](live-capture.mjs)           | **Live app** (Operations tab) |
| 6   | [06-eval.png](renders/06-eval.png)           | [panels/06-eval.html](panels/06-eval.html)     | Mockup — no eval UI in wave   |

Plus a combined 2×3 contact sheet: [contact-sheet.png](renders/contact-sheet.png).

**Why the split?** Panels 1, 2, 4, 5 map 1:1 to real tabs in the app
(`Workspace`, `Queue`, `Analytics`, `Operations`) and are captured
from the running dev server with the workspace-hero flag flipped on.
Panels 3 (ML intent confidence view) and 6 (Eval harness results)
are aspirational surfaces — [OpsTab.tsx](../../src/components/Ops/OpsTab.tsx)
explicitly notes that eval, triage, and runbook tooling stays out of
the active UI in this wave, and the ML-intent drilldown doesn't have
a dedicated page. For those two, the HTML mockup is the canonical
portfolio asset until the feature ships.

## Rendering paths

### Live capture ([live-capture.mjs](live-capture.mjs))

Starts `pnpm dev` on port 1422 with `VITE_E2E_MOCK_TAURI=1` so the
frontend runs browser-standalone against the IPC mocks in
[`src/test/e2eTauriMock.ts`](../../src/test/e2eTauriMock.ts). Primes
`localStorage` with the workspace-hero flag and the admin-tabs
override, drives the composer on the Workspace tab so a grounded
draft actually renders, then navigates through Queue / Analytics /
Operations and screenshots each at 1440×900 CSS / 2× DPR.

```bash
# from repo root
node docs/screenshots/live-capture.mjs
```

### HTML mockup ([capture.mjs](capture.mjs))

Six self-contained HTML files under [`panels/`](panels/) that reuse
the live app's token set via [`shell.css`](shell.css). Playwright
renders each to a 2880×1800 PNG. Use this when the portfolio needs an
idealized or populated view of a feature that the live dev server
doesn't seed with rich enough data.

```bash
# from repo root
node docs/screenshots/capture.mjs
```

### Rebuild the contact sheet only

When you've mixed live captures and mockups and want to re-stitch the
2×3 sheet without rerendering panels:

```bash
node docs/screenshots/rebuild-contact-sheet.mjs
```

## Design system reuse

Every panel — live or mockup — uses only the `--as-*` tokens from
[`src/styles/revamp/tokens.css`](../../src/styles/revamp/tokens.css):

- Surfaces: `--as-surface-0/1/2/3`, `--as-glass-1/2/3`
- Text: `--as-text-1/2/3`
- Accent: `--as-accent-1/2`, `--as-accent-surface-1`, `--as-accent-border-1`
- Status: `--as-good/warn/bad/info` families
- Type: `--as-font-sans`, `--as-font-mono`
- Shell glow: `--as-glow-1/2`

No new tokens are introduced. If the tokens in the live app change:

- `live-capture.mjs` picks them up automatically (it renders the real app)
- `shell.css` is the single place to re-sync the HTML mockups

## What's next

Session 3 turns the hero screenshot
([01-workspace.png](renders/01-workspace.png), now a real app capture)
and the contact sheet into a landscape-letter one-pager PDF with the
tagline, five feature pillars, and the impact-stats strip.
