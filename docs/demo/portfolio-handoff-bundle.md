# Portfolio Demo Handoff Bundle

Last packaged: June 7, 2026

Latest visual sync: June 7, 2026. The live screenshot capture pipeline was
rerun, the contact sheet was rebuilt, the one-pager PDF/PNG were regenerated
from the current hero workspace screenshot, the editable deck PPTX was rebuilt,
and the deck PDF preview was regenerated with the bundled Codex runtime
`soffice` binary.

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

## Current Artifact Inventory

| Artifact          | Path                                         | Current state                                                |
| ----------------- | -------------------------------------------- | ------------------------------------------------------------ |
| Screenshot sheet  | `docs/screenshots/renders/contact-sheet.png` | 2880 x 2700 PNG, rebuilt from current panel PNGs.            |
| One-pager preview | `docs/one-pager/AssistSupport-one-pager.png` | 2112 x 1632 PNG, regenerated from current source.            |
| One-pager PDF     | `docs/one-pager/AssistSupport-one-pager.pdf` | Regenerated from current source.                             |
| Editable deck     | `docs/deck/AssistSupport-LinkedIn-Live.pptx` | Local rebuild output from `docs/deck/build.mjs`; gitignored. |
| Deck PDF preview  | `docs/deck/AssistSupport-LinkedIn-Live.pdf`  | 12 pages, regenerated from the editable deck.                |
| Video script      | `docs/deck/DEMO-VIDEO.md`                    | Synced to the Jordan/Northstar fake-KB story.                |
| Rehearsal kit     | `docs/deck/REHEARSAL.md`                     | Synced to the Jordan/Northstar fake-KB story.                |
| Case study        | `docs/case-study.md`                         | Links to the current one-pager, deck, and screenshots.       |

Deck PDF regeneration command used on this workstation:

```bash
/Users/d/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/soffice \
  --headless \
  --convert-to pdf \
  --outdir docs/deck \
  docs/deck/AssistSupport-LinkedIn-Live.pptx
```

## Share Package

Use this order when sending or posting the public portfolio package:

| Order | Item                | Use                               | Attach or link                                                     |
| ----- | ------------------- | --------------------------------- | ------------------------------------------------------------------ |
| 1     | Root README         | Public project entry point        | Link: `https://github.com/saagpatel/AssistSupport`                 |
| 2     | Case study          | Long-form technical narrative     | Link: `docs/case-study.md`                                         |
| 3     | One-pager PDF       | Recruiter, hiring, or quick scan  | Attach: `docs/one-pager/AssistSupport-one-pager.pdf`               |
| 4     | Screenshot sheet    | Visual proof of the product shape | Attach: `docs/screenshots/renders/contact-sheet.png`               |
| 5     | Deck PDF preview    | Talk, walkthrough, or async pitch | Attach: `docs/deck/AssistSupport-LinkedIn-Live.pdf`                |
| 6     | Sanitized demo plan | Operator rehearsal and QA         | Link: `docs/demo/sanitized-demo-plan.md`; do not attach by default |
| 7     | Demo video script   | Recording plan                    | Link: `docs/deck/DEMO-VIDEO.md`; attach only with a rendered video |
| 8     | LinkedIn rehearsal  | Live-talk prep                    | Link: `docs/deck/REHEARSAL.md`; attach only for speaker handoff    |

Do not attach `docs/deck/AssistSupport-LinkedIn-Live.pptx` unless you are
explicitly sending an editable deck to a speaker. It is a local rebuild output,
not the committed public preview.

Recommended captions:

- **Portfolio card:** AssistSupport is a local-first macOS support assistant
  that drafts KB-grounded IT responses from a sanitized demo knowledge base.
- **LinkedIn post:** I built AssistSupport to show what an AI support tool looks
  like when the privacy boundary is the laptop: local retrieval, trust-gated
  drafts, clickable citations, and a feedback loop that turns abstentions into
  KB work.
- **Recruiter note:** This package includes the case study, one-page summary,
  screenshot sheet, and deck preview for AssistSupport, a Tauri/React/Rust
  local-first support assistant with sanitized demo data.
- **Short DM:** Here is the AssistSupport portfolio package: case study,
  one-pager, screenshot sheet, and deck preview, all using fictional Northstar
  Labs demo data.
- **Video caption:** AssistSupport turns a fictional USB/offsite support ticket
  into a grounded, cited response, then feeds operator ratings into mock
  knowledge-gap analytics without using real tenant data.

Recommended attachment set for email or hiring packets:

1. `docs/one-pager/AssistSupport-one-pager.pdf`
2. `docs/screenshots/renders/contact-sheet.png`
3. `docs/deck/AssistSupport-LinkedIn-Live.pdf`

Recommended links to include beside the attachments:

1. `https://github.com/saagpatel/AssistSupport`
2. `https://github.com/saagpatel/AssistSupport/blob/master/docs/case-study.md`
3. `https://github.com/saagpatel/AssistSupport/blob/master/docs/demo/sanitized-demo-plan.md`

The repo-relative paths in the table are for in-repo prep. Use the full URLs
above in email, DMs, portfolio posts, and social captions.

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

Publication dry run, in reader order:

1. Open the root [README](../../README.md) and confirm the public demo section
   points to the sanitized demo plan, portfolio index, and this handoff.
2. Open the [sanitized demo plan](./sanitized-demo-plan.md) and confirm the
   fake-KB script uses the Jordan/Northstar USB/offsite story.
3. Open the [portfolio index](../portfolio/README.md) and confirm the four
   primary artifacts link to committed files or explicit rebuild instructions.
4. Open the committed artifacts:
   [one-pager PDF](../one-pager/AssistSupport-one-pager.pdf),
   [deck PDF preview](../deck/AssistSupport-LinkedIn-Live.pdf), and
   [screenshot contact sheet](../screenshots/renders/contact-sheet.png).
5. Open the [case study](../case-study.md), [rehearsal kit](../deck/REHEARSAL.md),
   and [demo video script](../deck/DEMO-VIDEO.md). Confirm they use the same
   Jordan/Northstar story and the current fictional gap labels.
6. Treat `docs/deck/AssistSupport-LinkedIn-Live.pptx` as a local editable
   rebuild output only. Share the committed PDF preview unless rebuilding the
   deck for a live presentation.

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
