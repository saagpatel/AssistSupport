# AssistSupport External Channel Playbook

Last prepared: June 7, 2026

Use this playbook when moving the sanitized AssistSupport portfolio package from
the repo into a real external channel. It keeps the action sequence concrete
without storing private recipient data in the repository.

Source package: [outbound-share-package.md](./outbound-share-package.md)

Publication log: [publication-log.md](./publication-log.md)

## Non-Negotiables

- Use only fictional Northstar Labs demo language.
- Do not paste private replies, email addresses, profile handles, hiring
  contact names, workspace exports, real tickets, `.env` values, credentials, or
  local database contents into repo docs.
- Do not attach `docs/deck/AssistSupport-LinkedIn-Live.pptx` unless an editable
  deck is explicitly requested by a speaker or reviewer.
- Prefer public GitHub links for repo docs and attach only the committed PDF/PNG
  portfolio artifacts.
- After posting or sending, record only a public URL or a generic sent-channel
  note in the publication log.

## Channel Decision Table

| Channel        | Use when                                          | Primary draft source | Attachments                                     | Log note shape                     |
| -------------- | ------------------------------------------------- | -------------------- | ----------------------------------------------- | ---------------------------------- |
| Portfolio site | Updating a public project page or case-study card | Portfolio Card Draft | Contact sheet or one-pager preview if supported | Public portfolio URL               |
| LinkedIn post  | Sharing public build narrative and repo link      | LinkedIn Post Draft  | Contact sheet PNG                               | Public LinkedIn post URL           |
| Email packet   | Sending to a hiring contact or reviewer           | Email Draft          | One-pager PDF, contact sheet PNG, deck PDF      | `sent via email to hiring contact` |
| Short DM       | Sending a lightweight intro in a private thread   | Short DM Draft       | None by default                                 | `shared in private DM`             |
| Video post     | Publishing a rendered walkthrough                 | Video Caption Draft  | Rendered video plus optional contact sheet      | Public video URL                   |

## Portfolio Site Runbook

1. Open the portfolio CMS or repo that owns the public project page.
2. Create or update the AssistSupport project entry using the Portfolio Card
   Draft from the outbound package.
3. Include the public repo link and, where space allows, the case study and
   sanitized demo plan links.
4. Add either the contact sheet or one-pager preview as the visual asset.
5. Preview the published page and confirm the first viewport clearly identifies
   AssistSupport as a local-first macOS support assistant.
6. Publish the page.
7. Record the public URL in the publication log.

Publication-log entry:

```text
Channel: Portfolio site
State: Published
Date: <publish or send date>
URL or sent-channel note: <public portfolio URL>
Attachments used: contact sheet PNG or one-pager preview
Links included: repo, case study, sanitized demo plan
Caption/source draft used: portfolio card draft
Follow-up: refresh after a rendered demo video is available
Safety check: no private data, no real ticket data, no credentials
```

## LinkedIn Post Runbook

1. Open LinkedIn and start a new post.
2. Paste the LinkedIn Post Draft from the outbound package.
3. Attach `docs/screenshots/renders/contact-sheet.png`.
4. Confirm the text frames Northstar Labs as fictional demo data.
5. Confirm no private recipient, employer, customer, ticket, or workspace detail
   has been added.
6. Publish the post.
7. Copy the public post URL and record it in the publication log.

Publication-log entry:

```text
Channel: LinkedIn post
State: Published
Date: <publish or send date>
URL or sent-channel note: <public LinkedIn post URL>
Attachments used: screenshot contact sheet
Links included: repo, case study
Caption/source draft used: LinkedIn post draft
Follow-up: reply with one-pager or demo video link if requested
Safety check: no private data, no real ticket data, no credentials
```

## Email Packet Runbook

1. Start the email in the mail client.
2. Add the real recipient only in the mail client, not in repo docs.
3. Paste the Email Draft from the outbound package.
4. Attach:
   - `docs/one-pager/AssistSupport-one-pager.pdf`
   - `docs/screenshots/renders/contact-sheet.png`
   - `docs/deck/AssistSupport-LinkedIn-Live.pdf`
5. Include the repo, case-study, and sanitized-demo-plan links.
6. Confirm the attachments open locally before sending.
7. Send the email.
8. Record a generic sent-channel note in the publication log.

Publication-log entry:

```text
Channel: Email packet
State: Sent
Date: <publish or send date>
URL or sent-channel note: sent via email to hiring contact
Attachments used: one-pager PDF, screenshot contact sheet, deck PDF preview
Links included: repo, case study, sanitized demo plan
Caption/source draft used: email draft
Follow-up: send rendered video link if requested
Safety check: no private data, no real ticket data, no credentials
```

## Short DM Runbook

1. Open the private messaging surface.
2. Add the real recipient only in that messaging surface, not in repo docs.
3. Paste the Short DM Draft from the outbound package.
4. Confirm the message links to the repo and case study only.
5. Send the message.
6. Record a generic sent-channel note in the publication log.

Publication-log entry:

```text
Channel: Short DM
State: Sent
Date: <publish or send date>
URL or sent-channel note: shared in private DM
Attachments used: none
Links included: repo, case study
Caption/source draft used: short DM draft
Follow-up: send one-pager PDF if requested
Safety check: no private data, no real ticket data, no credentials
```

## Video Post Runbook

1. Render the walkthrough from the storyboard in
   [DEMO-VIDEO.md](../deck/DEMO-VIDEO.md).
2. Review the video end to end and confirm it shows only fictional Northstar
   Labs demo data.
3. Open the target video platform.
4. Paste the Video Caption Draft from the outbound package.
5. Upload the rendered video.
6. Include the public repo link.
7. Publish the post.
8. Copy the public video URL and record it in the publication log.

Publication-log entry:

```text
Channel: Video post
State: Published
Date: <publish or send date>
URL or sent-channel note: <public video URL>
Attachments used: rendered demo video
Links included: repo
Caption/source draft used: video caption draft
Follow-up: add video URL to portfolio card
Safety check: no private data, no real ticket data, no credentials
```

## Pre-Send Verification

Run the pre-publish checks in
[portfolio-handoff-bundle.md](./portfolio-handoff-bundle.md) before publishing a
public channel or sending an attachment bundle.

Manual check each time:

- The channel draft still says the demo uses fictional Northstar Labs data.
- The attachments are the committed one-pager PDF, contact sheet PNG, and deck
  PDF preview.
- The public links are repo, case study, and sanitized demo plan.
- No private names, addresses, handles, customer details, or real ticket text
  have been added.
- The publication log will capture only a public URL or safe generic sent note.
