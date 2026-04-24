# Portfolio Screenshot Set — Captions

Six 2× panels. Four are captures from the live app with the workspace
hero flag on (`docs/screenshots/live-capture.mjs`); two are HTML
mockups of surfaces that don't have a dedicated UI in the current
wave (`docs/screenshots/panels/*.html`).

Voice: engineering-professional. One to two sentences per panel,
intended for use beside the screenshot on a portfolio site, case
study, or LinkedIn post.

## 1. Workspace in action · [01-workspace.png](renders/01-workspace.png) · LIVE

> Real capture of the hero workspace: the composer carries the ticket,
> a grounded draft at 16px / 1.65 lands beneath an 86%-confident
> gauge, inline `[n]` citations jump to the cited KB source, and the
> triage rail on the right tracks the 4-step workflow with live
> signals. Every token of the draft is generated locally on the
> laptop — the frontend is wired to a mocked Tauri IPC layer so no
> request leaves the machine even in this dev capture.

## 2. Triage queue with status badges · [02-queue.png](renders/02-queue.png) · LIVE

> Real capture of the Queue Command Center: Triage / History /
> Templates tabs, per-bucket counters (total / unassigned /
> in-progress / at-risk), filter chips for queue slice (all /
> unassigned / at-risk / in-progress / resolved), and the Team
> Scorecard + Batch Triage side panels. Seeded with the dev mock's
> single VPN cluster so the recent-clusters list is populated.

## 3. ML intent confidence view · [03-intent.png](renders/03-intent.png) · mockup

> Aspirational transparency view for the logistic-regression intent
> classifier: predicted class with calibrated probability, per-class
> logit bars, feature-weight contributions, nearest labeled neighbors,
> and a live trace through the hybrid pipeline (intent → retrieval
> → rerank → draft). No dedicated UI for this drilldown ships in the
> current wave — this is the target surface for the next iteration.

## 4. KB gap analysis dashboard · [04-kb-gap.png](renders/04-kb-gap.png) · LIVE

> Real capture of the Analytics view with the dev mock data: quality
> metrics (avg time to draft · copy per save · edit save rate) with
> thresholds and the Knowledge Gaps block ready to surface
> low-confidence or ungrounded queries once gap candidates exist.
> The richer populated view (clustered gaps, 14-day confidence
> distribution, prioritized article backlog) ships as
> [panels/04-kb-gap.html](panels/04-kb-gap.html) for reference.

## 5. Deployment &amp; rollback ops surface · [05-ops.png](renders/05-ops.png) · LIVE

> Real capture of the Operations / Deployment view: preflight runner,
> last-run rollback control, release-validation-failure trigger,
> signed / unsigned artifact counters, and an artifact record for
> `app_bundle 1.0.0` (stable · signed) with a verify action. The
> guardrail-gated canary + eval-gate promotion view ships as
> [panels/05-ops.html](panels/05-ops.html) for the populated version.

## 6. Eval harness results · [06-eval.png](renders/06-eval.png) · mockup

> Aspirational eval-harness surface covering grounding, faithfulness,
> intent F1, retrieval NDCG@5, end-to-end latency, and safety refusals
> with explicit release-gate thresholds and a 12-run score history.
> [OpsTab.tsx](../../src/components/Ops/OpsTab.tsx) explicitly notes
> that eval tooling stays out of the active UI in this wave — the
> mockup is the canonical portfolio asset until the feature ships.
