# External Dispatch Runbook

> **Stub — 2026-04-21.** Full content lands during
> [docs/plans/product-improvements-roadmap.md](../plans/product-improvements-roadmap.md)
> Phase 3 (`collaboration_dispatch` feature flag). This stub exists so the gap
> is tracked alongside the other runbooks.

## When to use this runbook

Use when a draft or ticket resolution needs to be dispatched to an external
system — Jira, Slack, Teams, ServiceNow, or email — outside AssistSupport.
AssistSupport is local-first by policy: no silent writes. Every external
dispatch is user-confirmed with a preview.

## Before you start

- The draft is final and has been reviewed by the operator.
- The destination system is reachable from the operator workstation.
- The operator has the right credentials for the destination system (this
  runbook does not cover credential rotation — see the vendor's own process).

## Step 1: Preview the dispatch

- Open the dispatch panel on the ticket.
- Confirm the destination system and the recipient address/channel/ticket ID.
- Confirm the full payload that will be sent, including any attachments.

## Step 2: Confirm scope

- AssistSupport never writes to the destination system until you click
  `Dispatch` in the preview panel. If a keyboard shortcut moved the cursor
  past the preview without a click, re-open and re-confirm.
- If the dispatch is bulk (multiple tickets), walk at least the first and
  last item in the batch before confirming.

## Step 3: Record the outcome

- On success, AssistSupport writes a dispatch event to the local audit log
  and links the resulting external ticket/ID back to the source draft.
- On failure, re-read the error message. Most failures are authentication,
  rate-limit, or destination-validation errors — follow the destination
  system's own remediation, do not retry blindly.

## Step 4: Follow-up on the local side

- Mark the source draft as dispatched.
- If the dispatch created a KB gap (you needed to write the same content in
  two places), flag it for KB promotion so the next operator doesn't
  repeat the work.

## Escalation

- If a dispatch went to the wrong destination, follow the destination
  system's own retraction process immediately. AssistSupport cannot recall
  an external dispatch.
- If an entire destination system is unreachable for more than 15 minutes,
  surface it as an ops incident.

## Related

- [docs/runbooks/shift-handoff.md](./shift-handoff.md)
- [docs/runbooks/dependency-advisory-triage.md](./dependency-advisory-triage.md)
