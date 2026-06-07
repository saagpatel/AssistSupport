# AssistSupport Outbound Share Package

Last prepared: June 7, 2026

Use this as the copy/paste-ready outbound package for the sanitized
AssistSupport portfolio demo. It uses only fictional Northstar Labs demo data.

After posting or sending, record the public URL or sent-channel note in
[publication-log.md](./publication-log.md).

For channel-specific operator steps, use
[external-channel-playbook.md](./external-channel-playbook.md).

## Attachments

Attach these three files for email, hiring packets, or direct portfolio review:

1. `docs/one-pager/AssistSupport-one-pager.pdf`
2. `docs/screenshots/renders/contact-sheet.png`
3. `docs/deck/AssistSupport-LinkedIn-Live.pdf`

Do not attach `docs/deck/AssistSupport-LinkedIn-Live.pptx` unless a speaker
explicitly needs the editable local rebuild output.

## Public Links

Include these links beside the attachments:

1. Repo: `https://github.com/saagpatel/AssistSupport`
2. Case study:
   `https://github.com/saagpatel/AssistSupport/blob/master/docs/case-study.md`
3. Sanitized demo plan:
   `https://github.com/saagpatel/AssistSupport/blob/master/docs/demo/sanitized-demo-plan.md`

Optional supporting links:

- Portfolio index:
  `https://github.com/saagpatel/AssistSupport/blob/master/docs/portfolio/README.md`
- Demo video script:
  `https://github.com/saagpatel/AssistSupport/blob/master/docs/deck/DEMO-VIDEO.md`
- LinkedIn Live rehearsal kit:
  `https://github.com/saagpatel/AssistSupport/blob/master/docs/deck/REHEARSAL.md`

## Email Draft

Subject: AssistSupport portfolio package

Hi,

I wanted to share AssistSupport, a local-first macOS support assistant I built
with Tauri, React, Rust, and a local ML retrieval pipeline.

The package includes:

- A one-page PDF summary
- A screenshot contact sheet
- A 12-slide deck PDF preview
- A case study covering the architecture and product tradeoffs
- A sanitized demo plan using fictional Northstar Labs data

Public links:

- Repo: https://github.com/saagpatel/AssistSupport
- Case study:
  https://github.com/saagpatel/AssistSupport/blob/master/docs/case-study.md
- Sanitized demo plan:
  https://github.com/saagpatel/AssistSupport/blob/master/docs/demo/sanitized-demo-plan.md

The demo story is intentionally fake: Jordan Lee from Finance asks whether
board-review slides can be copied to a USB drive for offsite travel. The app
routes the ticket, drafts a grounded response with citations, and shows how
operator feedback turns low-confidence questions into mock knowledge-gap work.

The privacy boundary is the point: local retrieval, trust-gated drafts,
clickable citations, and no real tenant data in the demo path.

Best,

## LinkedIn Post Draft

I built AssistSupport to explore what an AI support tool looks like when the
privacy boundary is the laptop.

It is a local-first macOS support assistant built with Tauri, React, Rust, and a
local ML retrieval pipeline. The demo uses fictional Northstar Labs data: a
Finance user asks whether board-review slides can be copied to a USB drive for
offsite travel.

AssistSupport routes the ticket, retrieves the relevant mock KB policy, drafts a
cited response, and turns operator feedback into knowledge-gap signals.

What I wanted to make visible:

- Local retrieval before generation
- Trust-gated answer / clarify / abstain modes
- Clickable citations back to KB sources
- A feedback loop that turns abstentions into KB work
- A demo path with no real tenant data

Repo: https://github.com/saagpatel/AssistSupport
Case study:
https://github.com/saagpatel/AssistSupport/blob/master/docs/case-study.md

Suggested attachment: `docs/screenshots/renders/contact-sheet.png`

## Portfolio Card Draft

**AssistSupport**

Local-first macOS support assistant for drafting KB-grounded IT responses from a
sanitized demo knowledge base.

Built with Tauri, React, TypeScript, Rust, local intent classification, hybrid
retrieval, cross-encoder reranking, SQLCipher-backed local storage, and optional
local LLM inference.

Featured artifacts:

- One-pager PDF
- Screenshot contact sheet
- Deck PDF preview
- Architecture case study
- Sanitized fake-KB demo plan

Repo: `https://github.com/saagpatel/AssistSupport`

## Short DM Draft

Here is the AssistSupport portfolio package:
https://github.com/saagpatel/AssistSupport

It includes a case study, one-pager, screenshot sheet, and deck preview for a
local-first macOS support assistant. The demo uses fictional Northstar Labs data
and shows a grounded USB/offsite support response with mock KB citations and
knowledge-gap feedback.

Good first read:
https://github.com/saagpatel/AssistSupport/blob/master/docs/case-study.md

## Video Caption Draft

AssistSupport turns a fictional USB/offsite support ticket into a grounded,
cited response, then feeds operator ratings into mock knowledge-gap analytics.

Local-first macOS app. Sanitized demo data. No real tenant data in the demo
path.

Repo: https://github.com/saagpatel/AssistSupport

## Final Send Checklist

- [ ] Attach `docs/one-pager/AssistSupport-one-pager.pdf`
- [ ] Attach `docs/screenshots/renders/contact-sheet.png`
- [ ] Attach `docs/deck/AssistSupport-LinkedIn-Live.pdf`
- [ ] Include the repo, case-study, and sanitized-demo-plan links
- [ ] Follow the matching channel runbook in
      `docs/demo/external-channel-playbook.md`
- [ ] Do not attach the gitignored PPTX unless editable slides are requested
- [ ] Do not include private workspace data, `.env` files, real tickets, or real
      credentials
- [ ] Keep all demo language framed as fictional Northstar Labs data
