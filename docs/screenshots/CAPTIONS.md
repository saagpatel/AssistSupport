# Portfolio Screenshot Set — Captions

Six 2× panels rendered from self-contained HTML mockups that reuse the
live app's design tokens. PNGs live under `renders/` (2880×1800 each, plus
a 2×3 contact sheet at 2880×2700).

Voice: engineering-professional. One to two sentences per panel,
intended for use beside the screenshot on a portfolio site, case
study, or LinkedIn post.

## 1. Workspace in action — [01-workspace.png](renders/01-workspace.png)

> Three-region workspace with the AI draft as the hero: a KB-grounded
> answer at 16px / 1.65, inline `[n]` citations that jump to the cited
> source, and a triage rail on the right that collapses confidence,
> grounded-claim ratio, alternatives, and the feedback loop into one
> column. Every token inside the draft is generated locally on the
> laptop — no request leaves the machine.

## 2. Triage queue with status badges — [02-queue.png](renders/02-queue.png)

> A density-first queue where each row carries intent, priority,
> model confidence, and lifecycle status (Open / Triaged / Drafted /
> Sent / Escalated) in a single scan. A 7-day deflection sparkline
> and an intent mix breakdown sit in the sidebar so the operator sees
> where the funnel is leaking without leaving the pane.

## 3. ML intent confidence view — [03-intent.png](renders/03-intent.png)

> A transparency view for the logistic-regression intent classifier:
> the predicted class (Policy · removable_media, 0.86) is shown with
> calibrated probability, feature-weight contributions, nearest
> labeled neighbors, and a live trace through the hybrid pipeline
> (intent → retrieval → rerank → draft) so every routing decision is
> auditable.

## 4. KB gap analysis dashboard — [04-kb-gap.png](renders/04-kb-gap.png)

> The self-improving loop: low-confidence queries are clustered,
> ranked by impact (affected tickets × retrieval miss rate), and turned
> into a prioritized list of KB articles to write. A 14-day confidence
> distribution makes the trend between grounded and abstained answers
> visible at a glance.

## 5. Deployment &amp; rollback ops surface — [05-ops.png](renders/05-ops.png)

> Release orchestration for a local-first desktop app: signed build,
> canary promotion gated on latency + error + confidence guardrails,
> a post-deploy health grid, and a one-click rollback lane that lists
> the current release, last known-good, any paused canaries, and the
> 90-second rollback SLO.

## 6. Eval harness results — [06-eval.png](renders/06-eval.png)

> Golden-set regression for the retrieval + drafting stack: grounding,
> faithfulness, intent F1, retrieval NDCG@5, end-to-end latency, and
> safety refusals all evaluated per commit with explicit release-gate
> thresholds. The score history sparkline shows the 12-run trend that
> makes "is this change a regression?" a yes-or-no question.
