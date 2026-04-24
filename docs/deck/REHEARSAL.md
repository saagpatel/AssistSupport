# LinkedIn Live Rehearsal Kit

Companion to [AssistSupport-LinkedIn-Live.pptx](AssistSupport-LinkedIn-Live.pptx).
Walks you through a **~30-minute talk** structure plus **10-minute
Q&A**. Timing, pivots per audience, and anticipated questions per
slide. Rehearse twice — once with video off reading through cues, once
full-dress with the live demo.

## Total budget — 40 min

| Block          | Target | Notes                                              |
| -------------- | ------ | -------------------------------------------------- |
| Slides 01 – 03 | 5 min  | Hook + framing. Do **not** spend more.             |
| Slide 04       | 4 min  | Architecture — heaviest visual, slow down.         |
| Slide 05       | 5 min  | **Live demo pause.** Budget extra for interaction. |
| Slides 06 – 08 | 7 min  | ML intent · hybrid search · trust gating.          |
| Slide 09       | 3 min  | Feedback loop — the self-improving story.          |
| Slide 10       | 2 min  | Ops + eval — quick pass for IT leaders.            |
| Slide 11       | 3 min  | Lessons — pick 2 to dwell on by audience.          |
| Slide 12 + Q&A | 11 min | Open with one planted question if room is quiet.   |

Running long? Cut slide 06 feature-weights and slide 08 "per-sentence
match" details first — the thesis still lands.

## Slide-by-slide cues

### 01 · Title (40 sec)

Open with a single sentence: _"AssistSupport is an IT support assistant
that runs entirely on your laptop — no cloud, no tenant data leaking,
sub-25ms answers grounded in your own KB."_ Name drop Tauri + Rust +
local Ollama to anchor. Don't read the subtitle — let the slide do it.

### 02 · The problem (60 sec)

One bullet at a time. Land the **~25% of tickets** number verbally
since it's the same number as the deflection stat on slide 12 —
reviewers should feel the roundtrip. If audience is IT leadership,
linger on "per-seat pricing compounds." If engineering, linger on
"can't debug why."

### 03 · Thesis (90 sec)

Read the three pillar heads out loud: _local-first · KB-grounded ·
trust-gated_. The italic kicker at the bottom is the quote you'll
revisit in Q&A — read it slowly: **"You don't need a foundation model
on every desk. You need a pipeline that knows the KB cold, runs fast,
and keeps the operator in the loop."**

### 04 · Architecture (4 min)

Slowest slide. Walk left-to-right through the 5 stages. At DRAFT
(highlighted), pause — that's where the LLM lives. Call out the
runtime line verbatim so audience absorbs the dependency list. End on
the stat row: **1.8s p95 · 22ms p50 · ~5GB · 0 B exfil**. The last stat
(0 B) is the applause line — wait a beat.

### 05 · Demo (5 min, interactive)

Switch to screenshare / running app. Suggested script:

1. Click into the composer, paste the real prompt from the deck
   ("Can I use a flash drive...").
2. Click a single intent chip so the ML trace lights up.
3. Press **⌘↵**. Narrate the sub-25ms retrieval while it runs.
4. When the draft streams in, hover a `[1]` citation — show the
   source navigation.
5. Thumbs-up, then click "Save template" to show the feedback loop.
   Fallback if something breaks: switch back to slide 05's annotated
   screenshot and walk the 3 callouts.

### 06 · ML intent (90 sec)

This is the **"why not embeddings?" slide**. Lead with: _"Logreg
isn't a downgrade — it's a choice."_ Read the macro-F1 number. If
someone asks during Q&A about BERT-level quality, point to the
feature-weights visual and say _"every routing decision is
inspectable — try getting that from a dense model."_

### 07 · Hybrid search (2 min)

Latency budget visual on the right is the anchor — point to each bar
as you narrate. The key claim: _"Cross-encoder is slow but cheap
here because it only sees 14 candidates."_ That's the architectural
trick worth landing.

### 08 · Trust gating (90 sec)

Three mode cards — read the colored heads (ANSWER / CLARIFY / ABSTAIN)
aloud. The landing line: _"The model is allowed to say 'I don't
know.'"_ This is the IT-security applause line.

### 09 · Feedback loop (3 min)

The screenshot is the hero. Walk through the 5 bullets top-to-bottom.
Emphasize: _"Every abstained query is a lead on what to write next."_
That turns a negative (abstention) into a positive (KB backlog item).

### 10 · Ops (2 min)

Two screenshots side by side. Quick pass: _"Yes, a desktop app needs
a deploy story."_ Name the **90-second rollback SLO** and the eval
gate thresholds (grounding ≥ 0.90 · faithfulness ≥ 0.95).

### 11 · Lessons (3 min)

Pick **two** lessons to dwell on based on audience:

- **IT leaders / security** → #1 (local-first UX), #3 (inspectable logreg)
- **ML engineers** → #2 (prompt-cache), #3 (logreg vs embeddings)
- **Platform / desktop devs** → #4 (Tauri), #5 (one-click rating)
  Read the rest aloud but keep moving.

### 12 · Q&A (10 min)

Leave it on screen. Repeat the repo URL verbally: _"github dot com
slash saag patel slash AssistSupport."_ Don't fill silence — count 3
seconds after the first hand.

## Anticipated questions (by slide)

| From slide | Q                                                | A (short form)                                                                   |
| ---------- | ------------------------------------------------ | -------------------------------------------------------------------------------- |
| 04         | Why llama3.1-8b and not a 70B?                   | 5GB memory fits on any M-series · 1.2s draft is the budget · good enough.        |
| 04         | Can you swap the model?                          | Ollama backend · any chat-tuned model works · settings UI handles download.      |
| 06         | Why not BERT / sentence-transformers for intent? | Latency (50×) · model size (500×) · logreg is inspectable. Same F1.              |
| 07         | Won't TF-IDF miss semantic matches?              | That's what the cross-encoder is for · it reranks on semantic similarity.        |
| 08         | How do you force inline citations?               | Citations are generated _into_ the prompt · post-hoc strip if missing → abstain. |
| 09         | Who writes the KB articles?                      | Operators · the gap analyzer just prioritizes what to write.                     |
| 10         | Does the eval harness run per-commit?            | Yes · release gate blocks on grounding/faithfulness/intent thresholds.           |
| general    | Why not cloud?                                   | Data residency · zero per-seat · tenant isolation is a single laptop.            |
| general    | How does it scale to 1000 operators?             | It doesn't need to · each laptop is independent · shared KB via file sync.       |
| general    | What's the privacy story?                        | SQLCipher AES-256 · no network calls during inference · audited outbound.        |
| general    | Open source?                                     | Yes · MIT · github.com/saagpatel/AssistSupport.                                  |

## Opening line options (pick one per run)

1. _"I built an IT support assistant that runs entirely on my laptop. No cloud, no tenant data leaving, sub-25ms answers. This is how it works."_
2. _"Most AI support tools are expensive, leaky, and opaque. Today I'll show you one that's none of those — because it lives on your Mac."_
3. _"The last time I deployed an AI support system, three things went wrong. Today I'll show what we built so they can't go wrong again."_

## Closing line options

1. _"Everything you just saw is MIT-licensed and 229 commits. Fork it, ship your own."_
2. _"If there's one thing to take away: local-first is a UX decision, not just a security one. Your operators will trust the tool more."_
3. _"Support will always be repetitive. The question is whether repetition is suffered by humans or compiled down into a pipeline. Thanks for watching."_

## Dry-run checklist

- [ ] Fonts — IBM Plex Sans + JetBrains Mono installed locally (PowerPoint will fallback otherwise)
- [ ] Recording — Presenter View enabled so notes show on your laptop, slides on the stream
- [ ] Demo — `pnpm dev` + `VITE_E2E_MOCK_TAURI=1` + `VITE_ASSISTSUPPORT_REVAMP_WORKSPACE_HERO=1` primed before you start
- [ ] Fallback — [panels/01-workspace.html](../screenshots/panels/01-workspace.html) open in a spare browser tab in case the demo breaks
- [ ] Network — confirm LinkedIn Live upload path works 10 minutes before going live
- [ ] Camera — framed with the AssistSupport logo or a whiteboard in the background, not a messy desk
- [ ] Water — within reach; 40 minutes is longer than you think
