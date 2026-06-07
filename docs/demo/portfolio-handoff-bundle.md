# Portfolio Demo Handoff Bundle

Last packaged: June 7, 2026

## Scope

This bundle packages the verified sanitized demo into the portfolio surfaces:
live rehearsal, screenshot set, one-pager, LinkedIn Live deck, and 90-second
demo video. It is a handoff map, not a new data source.

Boundary: use only the fictional Northstar Labs mock path. Do not source `.env`
files, connect real workspaces, inspect private ticket exports, read Redis or
database dumps, or attach real integration credentials.

Canonical source: [rehearsal-snapshot.md](./rehearsal-snapshot.md).

## Demo Story

The story should stay stable across every artifact:

1. Jordan Lee from Finance asks whether board-review slides can be copied to a
   USB drive for offsite travel.
2. AssistSupport routes the ticket to `Policy / removable_media`.
3. The generated response denies USB/removable-media use for company data.
4. The response offers approved alternatives: SharePoint, OneDrive, ShareFile,
   encrypted email for small files, and a VPN-connected file share.
5. The source list maps the answer to the mock KB:
   `/mock/kb/removable-media-policy.md` and `/mock/kb/file-sharing-guide.md`.
6. Rating the draft demonstrates the feedback loop.
7. Analytics shows fictional gap clusters, currently:
   `VPN won't connect at HQ but works on hotspot` and
   `Outlook keeps crashing on macOS 14.5`.
8. The closing privacy line is local mock IPC, no real tenant data, no cloud AI
   call, deterministic fallback when MemoryKernel is offline.

## Best Screenshot Set

Use committed portfolio images for durable collateral:

| Use                  | Primary image                                           | Notes                                                                  |
| -------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------- |
| One-pager hero       | `docs/screenshots/renders/01-workspace.png`             | Current hero screenshot source for the one-pager.                      |
| Deck slide 05        | `docs/screenshots/renders/01-workspace.png`             | Fallback if live demo breaks.                                          |
| Feedback loop story  | `docs/screenshots/renders/04-kb-gap.png`                | Use alongside the exact Analytics labels in this bundle.               |
| Ops and eval story   | `docs/screenshots/renders/05-ops.png`, `06-eval.png`    | Keep eval surface labeled as mockup/aspirational.                      |
| Full portfolio proof | `docs/screenshots/renders/contact-sheet.png`            | Contact sheet for quick portfolio review.                              |
| Fresh rehearsal QA   | `/tmp/assistsupport-demo-rehearsal-*.png` from snapshot | Temporary proof only; do not commit unless intentionally regenerating. |

Do not mix temporary `/tmp` screenshots into committed collateral without a
separate screenshot-regeneration pass.

## One-Pager Alignment

The one-pager remains aligned with the verified rehearsal if these stay true:

- Headline keeps the local-first promise: no query leaves the machine.
- Impact strip labels `Demo KB` as sanitized/checked-in fake data.
- Hero image remains `docs/screenshots/renders/01-workspace.png`.
- Any numeric claim is current, traceable, or explicitly illustrative.

Regenerate only when the screenshot set or one-pager source text changes:

```bash
node docs/one-pager/generate.mjs
```

This handoff updates the one-pager source to avoid stale numeric gap-cluster
claims and keeps the committed one-pager exports aligned with that source.

## Deck Sync

The LinkedIn Live rehearsal kit now uses the verified Jordan/Northstar script.
Keep slide 05 in this order:

1. Paste the Jordan Lee USB/offsite ticket.
2. Show `Policy / removable_media`.
3. Generate the answer.
4. Show the denial, approved alternatives, and two mock KB sources.
5. Rate the draft.
6. Open Analytics and show the two current fictional gap clusters.

If the live app fails, use slide 05's workspace screenshot and then open
`docs/screenshots/panels/01-workspace.html` as the fallback walkthrough.

## Video Sync

The 90-second storyboard should use the same beats, but it does not need to show
every artifact. The cleanest cut is:

- Shot 2: paste the full Jordan Lee ticket.
- Shot 3: generate and zoom on the grounded response and confidence gauge.
- Shot 4: show citation/source mapping.
- Shot 5: rate the draft, then cut to Analytics Knowledge Gaps with the exact
  fictional labels from this bundle.
- Shot 6: privacy tell, phrased as no cloud AI call and no real tenant data.

Avoid stale numeric captions in the video unless they are refreshed from current
repo evidence or labeled as illustrative.

## Pre-Publish Checklist

Before posting the portfolio set, run:

```bash
rg -n "company\\.com|it\\.company|vpn\\.company|passwordreset\\.company|Priya Anand|Aisera" knowledge_base docs src search-api -g '!docs/demo/sanitized-demo-plan.md' -g '!docs/demo/rehearsal-snapshot.md' -g '!docs/demo/portfolio-handoff-bundle.md'
rg -n "IronKey|Apricorn|approved encrypted drive|whitelist-usb|PagerDuty rule 12" docs src -g '!docs/demo/sanitized-demo-plan.md' -g '!docs/demo/rehearsal-snapshot.md' -g '!docs/demo/portfolio-handoff-bundle.md'
node scripts/ci/check-workstation-preflight.mjs
node scripts/ci/check-workflow-command-drift.mjs
node scripts/ci/check-version-parity.mjs
```

Expected result: the two boundary scans return no matches, and the three node
checks pass.
