# Shift Handoff Runbook

> **Stub — 2026-04-21.** Full content lands during
> [docs/plans/product-improvements-roadmap.md](../plans/product-improvements-roadmap.md)
> Phase 3. This stub exists so the gap is tracked alongside the other runbooks.

## When to use this runbook

Use at the end of a support shift when active tickets, in-flight drafts, or
escalations need to transfer cleanly to the next operator. The goal is zero
context loss: no ticket should sit idle because two people each assumed the
other was handling it.

## Before you start

- The outgoing operator has `drafts` in flight, is mid-escalation, or is
  holding open queues that the incoming shift will inherit.
- Both operators have AssistSupport open on their own workstations.

## Step 1: Freeze the active queue view

Outgoing operator:

- Pin the current queue filter set (search, priority, owner) so the incoming
  operator can see the same slice.
- Flag any ticket with a not-yet-sent draft — these cannot be picked up
  silently without overwriting work.

## Step 2: Walk the open drafts

For each draft still open:

- Confirm the ticket ID, current draft state (autosaved / unsent), and the
  planned next step.
- If the draft is blocked on an external action, note the blocker and
  expected unblock time.
- If the draft is ready to send, the outgoing operator sends it before
  handoff.

## Step 3: Escalations and runbook-in-progress items

- List any ticket currently following a KB runbook. Note which step the
  operator was on.
- List any escalation paths that have been opened (manager, vendor, legal).
  These should never transfer mid-escalation without a named incoming owner.

## Step 4: Handoff record

- Save a handoff note as a new draft template tagged `shift-handoff` or
  write it to the team handoff channel.
- Include: outstanding ticket list, blocked items, pending escalations,
  anything unusual from the shift.

## Step 5: Incoming acknowledgement

- Incoming operator confirms the handoff note and picks up ownership in
  AssistSupport.
- If anything is unclear, incoming operator pushes back before the outgoing
  operator goes off shift.

## Escalation

- If a ticket must be handed off but no incoming operator is available,
  surface it to the team lead immediately rather than leaving it silent.
- For incidents that cross shift boundaries, follow the incident response
  process rather than a standard handoff.

## Related

- [docs/runbooks/dependency-advisory-triage.md](./dependency-advisory-triage.md)
- [docs/runbooks/safe-mode-recovery.md](./safe-mode-recovery.md)
