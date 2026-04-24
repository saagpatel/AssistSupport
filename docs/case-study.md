# AssistSupport · A Local-First IT Support Agent on a Mac

A case study in building an AI support assistant that's fast,
auditable, and private — by choosing the _unfashionable_ tool at every
decision point.

AssistSupport is a Tauri 2 + React + Rust desktop app that drafts
KB-grounded responses to IT support tickets. The ML stack — intent
classifier, hybrid retrieval, cross-encoder reranker, local LLM — runs
end-to-end on the operator's laptop. No cloud round trip, no per-seat
pricing, no tenant data leaking across a wire.

This case study walks through three architectural decisions that cut
against the industry default, and explains why each one was
load-bearing for the product.

## The problem

Tier-1 IT support is the same conversation, replayed. "Can I use a
flash drive?" "Why does Outlook keep crashing?" "How do I get Snowflake
access?" About a quarter of tickets are policy or how-to questions
already answered somewhere in the knowledge base. The operator's job is
not to invent an answer — it's to _find the right KB article, write a
human response that cites it, and paste it into Jira._

Cloud AI support tools promise to automate this. In practice they add
three problems the original workflow didn't have:

1. **Data residency.** Every ticket — including anything the user
   accidentally pastes — goes to a third-party tenant.
2. **Confident hallucinations.** Large models will cheerfully invent
   policy that doesn't exist. When the operator trusts the draft, IT
   Security gets paged.
3. **Per-seat pricing.** The economics only work if you eliminate
   operators. But operators are also the reviewers — you can't.

The target, then, is a tool that _sits next to the operator_, drafts
an answer they can actually paste, cites real files, and stays quiet
when it doesn't know. Running locally, because that's the only way to
close the first two problems.

## Decision 1 · Logistic regression over embeddings for intent

Every ticket needs to be routed: **policy · howto · access · incident
· runbook.** The routing decides which KB lane is searched, what
clarifying questions the draft asks, and whether a human needs to
approve the response before it ships.

The industry default for intent classification in 2026 is a small
sentence-transformer — `all-MiniLM-L6-v2` or similar — plus a dense
vector cosine classifier. It's the path of least resistance: drop in
a 22MB ONNX model, compute an embedding, nearest-neighbor against
labeled examples. F1 in the low 0.90s, just works.

AssistSupport ships **logistic regression over TF-IDF bigrams**.
Here's why.

**Latency.** The dense path takes 50–80ms for a single classification
on CPU. That sounds fine until you realize the classifier runs
_before retrieval_, and retrieval has its own 22ms budget, and the LLM
hasn't even started yet. Every millisecond in the classifier pushes
the time-to-first-token past the "feels instant" threshold. Logreg
lands in 3ms. That's a 20× headroom for the reranker.

**Inspectability.** A dense vector classifier's decision is an
inner-product between two tensors. When the routing is wrong, you
can't explain _why_ to the operator or to IT Security. Logreg's
decision is a sorted list of weighted tokens: `"flash drive" +2.41`,
`"removable media" +1.96`, `"usb stick" +1.58`. When something routes
oddly, you can see the reason on one screen — and you can fix it by
adding training examples, not by retraining a model.

**Calibration.** Softmax over logits is not a probability. At score
0.80 in an uncalibrated classifier, the empirical hit rate is often
0.60–0.70 — meaning 30% of "confident" routings are wrong. Logreg
with Platt scaling ships a calibrated score: at 0.80 the empirical
hit rate is 0.88. That matters because the _same score_ drives the
trust-gate: low confidence → clarify mode. If the score lies, the
gate lies.

**Model size.** The dense transformer is 22MB quantized; the logreg
is 4MB. Seems like nothing until you add it to the LLM footprint, the
reranker, the TF-IDF index, SQLCipher data — and remember that the
whole thing ships on a MacBook.

The tradeoff is expressiveness. Bigrams don't capture "USB drive ≈
flash drive" the way an embedding does. But the _next stage_ — hybrid
retrieval — uses a cross-encoder that handles semantics, so the
classifier doesn't need to. Pushing semantics to where the budget
allows it is the architectural win.

## Decision 2 · Hybrid TF-IDF + cross-encoder, not ANN

After routing, the pipeline retrieves KB articles and reranks them
for the LLM's context. The industry default is again dense vectors:
embed every KB chunk with a sentence-transformer, build an ANN index
(FAISS, hnswlib, or similar), cosine-search at query time.

AssistSupport runs **TF-IDF candidate retrieval** (returns ~14
candidates in 22ms) followed by **ms-marco-MiniLM-L-6-v2 cross-encoder
rerank** (reduces to top-4 in 48ms on CPU). Same reason: latency
budget + architectural trick.

The dense-retrieval path forces you to either:

- **Embed everything upfront at ingest.** Expensive one-time cost, but
  also an ongoing cost — every KB article change re-embeds. With
  3,500+ articles and a nightly reindex budget of 46 seconds, this
  doesn't fit.
- **Embed on-the-fly.** ~100ms per embedding, times 10 queries per
  draft session, times 40 drafts per operator per day = hours of
  aggregate CPU. Unfeasible.

The hybrid path embeds only the _query_ and _~14 candidates_ at draft
time. TF-IDF's recall is high for IT support prose (specific
technical terms dominate), and the cross-encoder restores semantic
precision on a small candidate set. Net latency: 22ms + 48ms = 70ms.
Net quality on the eval suite: NDCG@5 of 0.88, within 2 points of a
full dense pipeline at 10× the cost.

The architectural trick to internalize: **cross-encoders are slow
_per document_, but cheap when you only give them 14 documents.** The
cheap stage (TF-IDF) filters to a size where the expensive stage
(cross-encoder) becomes affordable. Most dense-retrieval systems skip
the filter and throw money at ANN hardware.

## Decision 3 · Trust-gated drafts, not optimistic generation

The third choice is less about technique and more about product.

Most LLM-powered support tools **always answer.** The model is prompted
to generate a response; if retrieval is weak, the response is just
vaguer. The operator sees a draft; the operator copies the draft. By
the time a hallucination is caught, it's in Jira.

AssistSupport has three explicit modes — **answer, clarify, abstain**
— gated on confidence and grounded-claim checks:

- **Answer** (≥0.80 confidence, all claims grounded): the draft ships
  with inline `[n]` citations. This is the common case.
- **Clarify** (0.60–0.79 or partial grounding): the draft is a single
  clarifying question back to the reporter. The operator can still
  edit and send, but the default is to stop the conversation until
  more data exists.
- **Abstain** (below threshold or any unsupported claim): the draft
  refuses, surfaces the ticket as a KB-gap candidate, and the operator
  takes over. Abstain fires on ~8% of tickets — the operator never
  sees a plausible-but-wrong draft.

Two technical pieces make this work:

**Inline citations are generated _into_ the prompt, not post-hoc.**
The LLM can't cite a document it didn't see; the retrieved chunks are
numbered and handed to it, and the prompt template instructs it to
include `[n]` markers. If the generated response lacks citations, it's
not stripped — it's flagged as unsupported and the mode drops to
abstain.

**Grounded-claim checks run per-sentence.** The draft is split into
sentences; each sentence is checked against the retrieved chunks for
textual or semantic overlap. Sentences that match at least one chunk
are "supported"; the ratio `supported / total` gates the mode. At
6/7 supported claims the draft ships with a visible "6/7 claims
supported" meter in the triage rail — the operator sees the gap
before they paste.

This looks like over-engineering until you realize **the KB-gap
dashboard (see [04-kb-gap.png](screenshots/renders/04-kb-gap.png))
is powered by the abstain signal.** Every abstention is a lead on
what to write next. The feedback loop that makes the product
self-improving depends on the trust gate being honest about what it
doesn't know. Optimistic generation would silently bury these signals
as "low-confidence answers that shipped anyway."

## The compound effect

Each decision on its own looks unfashionable. Stacked together, they
form the product's moat:

- The **3ms logreg** buys latency headroom for the **48ms cross-encoder**,
  which delivers **NDCG@5 = 0.88**, which feeds the **8B local LLM**
  enough context to draft at **1.2s end-to-end**.
- The **trust gate** blocks unsupported drafts, which makes the
  operator **actually trust** the tool, which makes them **rate
  drafts** instead of skipping the feedback surface.
- Ratings feed the **KB-gap analyzer**, which **prioritizes articles
  to write**, which fills the gaps that caused the low-confidence
  abstentions, which shifts the confidence distribution _right_ over
  time.

The product gets better because each piece is a **cheap**, **honest**
component that composes. No single component is doing magic. The
sum _is_ magic.

## What I'd do again — and what I wouldn't

**Would:**

- **Tauri 2 over Electron.** Apple notarization, bundle size, Rust
  FFI to the ML sidecar — iteration was 2–3× faster.
- **Ollama as the LLM runtime.** Zero-maintenance dependency. Swap
  models by changing a string. Everything else in the stack is tuned
  to the model's interface, not its identity.
- **SQLCipher from day one.** Retrofitting encryption is brutal.

**Wouldn't:**

- I'd spend more time on the **feedback UX** earlier. The KB-gap
  analyzer only works if operators actually click thumbs-up/down, and
  _any_ UX friction collapses that signal. A single-click rating is
  the lesson I'd start from.
- I'd build the **eval harness before the product.** Shipping a
  grounding regression in prod, then scrambling to measure it after
  the fact, was a bad trade.

## Links

- **Repo:** [github.com/saagpatel/AssistSupport](https://github.com/saagpatel/AssistSupport) (MIT, 229 commits)
- **One-pager:** [docs/one-pager/AssistSupport-one-pager.pdf](one-pager/AssistSupport-one-pager.pdf)
- **Deck:** [docs/deck/AssistSupport-LinkedIn-Live.pptx](deck/AssistSupport-LinkedIn-Live.pptx)
- **Screenshot set:** [docs/screenshots/](screenshots/)
- **Redesign handoff:** [docs/redesign/](redesign/)

---

_If there's one thing to take away: local-first is a UX decision, not
just a security one. Your operators will trust the tool more because
they can literally turn Wi-Fi off and it still works._
