# 90-second Demo Video · Storyboard + Script

A tight, async-consumable demo reel intended to live next to the
one-pager on a portfolio site and in LinkedIn / social posts. This
doc is the shot list, timing, and verbatim narration. Record once,
cut twice.

## Specs

- **Runtime:** 90 seconds (hard budget — under 2min plays through autoplay)
- **Aspect:** 16:9, 1920×1080, 60 fps capture
- **Audio:** voiceover over gentle ambient bed; no music with vocals
- **Captions:** on by default (most LinkedIn viewers watch muted)
- **End card:** 3 seconds · `github.com/saagpatel/AssistSupport` · MIT

## Pre-flight

```bash
VITE_E2E_MOCK_TAURI=1 pnpm dev -- --port 1422
# In the browser:
localStorage.setItem("assistsupport.flag.ASSISTSUPPORT_REVAMP_WORKSPACE_HERO", "1");
localStorage.setItem("assistsupport.flag.ASSISTSUPPORT_ENABLE_ADMIN_TABS", "1");
# Reload. The hero workspace renders.
```

Recording tool: QuickTime Screen Recording with system audio muted
(voice recorded separately into a clean mic), exported and
composited in whatever video tool you prefer (iMovie / ScreenFlow /
DaVinci). Cursor highlights recommended on all click interactions.

## Shot list

### Shot 1 · Cold open (0:00 – 0:08) · 8s

**Visual:** Close-up on the AssistSupport mark in the nav, zoom out
slowly to reveal the full workspace shell. No UI interaction.

**Narration:**

> _"IT support is the same conversation, replayed. AssistSupport is the
> second brain that sits next to the operator — and runs entirely on
> their laptop."_

**Caption:** `AssistSupport — a local-first IT support agent`

---

### Shot 2 · Ticket paste (0:08 – 0:18) · 10s

**Visual:** Paste the ticket text into the composer at normal typing
speed. Cursor drops into the textarea; text appears line-by-line.
The "Policy" intent chip illuminates automatically as the ML trace
fires.

**Narration:**

> _"Drop in a ticket. The ML classifier routes it in three
> milliseconds — policy, how-to, access, incident, or runbook — so
> the retrieval hits the right lane."_

**Caption:** `Logistic regression · 0.914 macro-F1 · 3 ms on-device`

---

### Shot 3 · Generate + stream (0:18 – 0:38) · 20s

**Visual:** Cursor moves to Generate (or hit ⌘↵). Brief flash on the
composer — retrieval runs. The answer starts streaming into the hero
column. Camera slowly zooms in on the confidence gauge as it fills to
86%. Inline `[1]` and `[2]` citation pills appear in the prose.

**Narration:**

> _"Retrieval is hybrid — TF-IDF filters the KB to fourteen
> candidates in twenty-two milliseconds, then a cross-encoder
> reranks to the top four. The draft streams in from a local
> Llama 3.1-8B at roughly 42 tokens per second. Inline `[n]`
> citations are generated directly into the prompt — the model
> can't cite a document it didn't actually see."_

**Caption:** `Hybrid retrieval · 22ms p50 · 46ms p95 · 3,500+ articles`

---

### Shot 4 · Click a citation (0:38 – 0:48) · 10s

**Visual:** Cursor hovers over `[1]` in the prose — the pill lights
up with the accent color. Click. The cited source entry highlights in
the Cited sources block beneath the draft. Smooth.

**Narration:**

> _"Every citation is clickable — it jumps to the exact KB article
> the claim came from. No hallucinations, no invented URLs."_

**Caption:** `0.93 grounded · 0.96 faithful · 6 / 7 claims supported`

---

### Shot 5 · Feedback → KB gap (0:48 – 1:08) · 20s

**Visual:** Cursor moves to the triage rail, clicks thumbs-up on the
Feedback card. Quick wipe. Cut to the **Analytics tab** opening —
KB Gap Analysis panel comes into frame. Camera pans over the ranked
gap clusters: VPN on office Wi-Fi · Outlook on macOS 14.5 · macOS 14
permissions drift.

**Narration:**

> _"When the operator rates a draft — or when the model abstains
> because the KB doesn't cover the question — that signal feeds a
> self-improving loop. Low-confidence queries are clustered, ranked
> by impact, and turned into a prioritized list of KB articles to
> write. Every abstention is a lead on what's next."_

**Caption:** `Self-improving · 14 gap clusters tracked · 87 tickets`

---

### Shot 6 · Privacy tell (1:08 – 1:22) · 14s

**Visual:** Quick cut to macOS Settings → Network, Wi-Fi toggle off.
Cut back to AssistSupport — the workspace still renders, user types a
new ticket, Generate still works, draft streams in. A small "offline"
badge could animate in for emphasis.

**Narration:**

> _"No cloud round trip. No tenant data leaving. No per-seat
> pricing. Turn the Wi-Fi off — it still works. That's what
> local-first means."_

**Caption:** `SQLCipher AES-256 · 0 B data exfil · Tauri 2 + Rust`

---

### Shot 7 · End card (1:22 – 1:30) · 8s

**Visual:** Solid dark (`#0B0D10`) background. Teal brand mark.
Text stack:

```
AssistSupport
Your support team's second brain
github.com/saagpatel/AssistSupport · MIT
```

**Narration:** _(silent — let the repo URL breathe)_

**Caption:** none — text is the message

---

## Timing summary

| Shot | Runtime | Running total |
| ---- | ------- | ------------- |
| 1    | 0:08    | 0:08          |
| 2    | 0:10    | 0:18          |
| 3    | 0:20    | 0:38          |
| 4    | 0:10    | 0:48          |
| 5    | 0:20    | 1:08          |
| 6    | 0:14    | 1:22          |
| 7    | 0:08    | 1:30          |

Running long? Cut shot 4 first (citation click) — the confidence
gauge in shot 3 already carries the grounded-claims story.

## Narration voice notes

- **Pace:** slow. 90 seconds is less than 200 words. Don't fill silence.
- **Tone:** engineering-professional, not salesy. No "unlock,"
  "supercharge," "revolutionize."
- **Accent word:** `local-first` (gentle emphasis, twice).
- **Applause line:** the "Turn the Wi-Fi off — it still works"
  sentence in shot 6. Half-second pause before it.

## Distribution checklist

- [ ] Upload to LinkedIn with 120-char caption:
      _"AssistSupport — a local-first IT support agent. ML-routed,
      KB-grounded drafts in under 25ms. No cloud, no leaks. MIT."_
- [ ] Pin the video on the AssistSupport README (above the fold)
- [ ] Embed on portfolio site next to the [one-pager PDF](../one-pager/AssistSupport-one-pager.pdf)
- [ ] Upload a 720p variant for Slack sharing (bandwidth-friendly)
- [ ] Add YouTube mirror with chapter markers at shot boundaries
