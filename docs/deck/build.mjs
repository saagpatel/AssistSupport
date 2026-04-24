/**
 * build.mjs — compose the 12-slide LinkedIn Live deck.
 *
 * Run:
 *     cd docs/deck && npm run build
 *
 * Outputs:
 *     docs/deck/AssistSupport-LinkedIn-Live.pptx
 *
 * Design system:
 *   - Background: warm-graphite dark (#0b0d10 → #141a22 subtle gradient
 *     via solid fills, since pptx can't do radial gradients natively)
 *   - Accent: teal #4fd1c5
 *   - Type: IBM Plex Sans (fallback Calibri), JetBrains Mono (fallback Consolas)
 *   - Slides are native text boxes + shapes + embedded PNGs, so the
 *     speaker can edit titles/bullets in PowerPoint before the Live.
 */

import PptxGenJS from "pptxgenjs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");
const SHOT = (n) => join(ROOT, "docs", "screenshots", "renders", n);

// =========================================================
// TOKENS
// =========================================================
const C = {
  bg: "0B0D10",
  bg2: "141A22",
  surface: "1B2330",
  border: "262E3B",
  text1: "F2F5F8",
  text2: "B8C0CC",
  text3: "7A8494",
  accent: "4FD1C5",
  accentDark: "2AA198",
  good: "2DD4BF",
  warn: "FBBF24",
  bad: "FB7185",
  info: "60A5FA",
};
const FONT = "IBM Plex Sans";
const MONO = "JetBrains Mono";

// =========================================================
// DECK SETUP — 16:9 widescreen, 13.333 × 7.5 in
// =========================================================
const pptx = new PptxGenJS();
pptx.layout = "LAYOUT_WIDE"; // 13.333 × 7.5 in
pptx.title = "Running a local-first support agent on a Mac";
pptx.author = "Saagar Patel";
pptx.company = "AssistSupport";
pptx.subject = "LinkedIn Live — portfolio-grade IT support assistant";

const W = 13.333;
const H = 7.5;

// Shared master slide: dark background + thin teal accent line + footer
pptx.defineSlideMaster({
  title: "BASE",
  background: { color: C.bg },
  objects: [
    // Top accent line
    {
      rect: {
        x: 0,
        y: 0,
        w: W,
        h: 0.04,
        fill: { color: C.accent },
        line: { color: C.accent, width: 0 },
      },
    },
    // Bottom thin border strip
    {
      rect: {
        x: 0,
        y: H - 0.35,
        w: W,
        h: 0.02,
        fill: { color: C.border },
        line: { color: C.border, width: 0 },
      },
    },
    // Footer left: brand
    {
      text: {
        text: "AssistSupport",
        options: {
          x: 0.55,
          y: H - 0.3,
          w: 3,
          h: 0.25,
          fontFace: FONT,
          fontSize: 9,
          color: C.text3,
          bold: true,
          charSpacing: 2,
        },
      },
    },
    // Footer center: talk title
    {
      text: {
        text: "Running a local-first support agent on a Mac",
        options: {
          x: 3.5,
          y: H - 0.3,
          w: 6.5,
          h: 0.25,
          fontFace: FONT,
          fontSize: 9,
          color: C.text3,
          align: "center",
        },
      },
    },
    // Page numbering is handled per-slide via pageChip() — no
    // master-level slideNumber to avoid double-numbering.
  ],
});

// =========================================================
// HELPERS
// =========================================================

/**
 * Add a numbered page chip (e.g. "01 / 12") in the top-right corner.
 */
function pageChip(slide, n, total = 12) {
  slide.addText(
    [
      {
        text: `${String(n).padStart(2, "0")}`,
        options: { color: C.accent, bold: true },
      },
      { text: ` / ${total}`, options: { color: C.text3 } },
    ],
    {
      x: W - 1.2,
      y: 0.25,
      w: 0.9,
      h: 0.3,
      fontFace: MONO,
      fontSize: 10,
      align: "right",
      charSpacing: 2,
    },
  );
}

/**
 * Add the eyebrow label above a slide title, e.g. "CHAPTER 02".
 */
function eyebrow(slide, text, x = 0.55, y = 0.55) {
  slide.addText(text, {
    x,
    y,
    w: 10,
    h: 0.3,
    fontFace: MONO,
    fontSize: 10,
    color: C.accent,
    bold: true,
    charSpacing: 3,
  });
}

/**
 * Add the slide title (the big h1).
 */
function title(slide, text, opts = {}) {
  slide.addText(text, {
    x: opts.x ?? 0.55,
    y: opts.y ?? 0.9,
    w: opts.w ?? W - 1.6,
    h: opts.h ?? 1.1,
    fontFace: FONT,
    fontSize: opts.fontSize ?? 34,
    color: C.text1,
    bold: true,
    valign: "top",
    charSpacing: -1,
  });
}

/**
 * Add a bulleted body list.
 */
function bullets(slide, items, opts = {}) {
  slide.addText(
    items.map((t) => ({ text: t, options: { bullet: { code: "2022" } } })),
    {
      x: opts.x ?? 0.55,
      y: opts.y ?? 2.4,
      w: opts.w ?? W - 1.6,
      h: opts.h ?? 4,
      fontFace: FONT,
      fontSize: opts.fontSize ?? 16,
      color: C.text2,
      paraSpaceAfter: 10,
      valign: "top",
    },
  );
}

/**
 * Add a horizontal stat row — 2-4 stat cards. `h` defaults to 1.6;
 * callers can pass a smaller height when vertical space is tight.
 */
function statRow(slide, stats, y = 5.3, h = 1.6) {
  const n = stats.length;
  const totalW = W - 1.1;
  const gap = 0.2;
  const w = (totalW - gap * (n - 1)) / n;
  const valueFont = h >= 1.5 ? 36 : 30;
  const valueH = h >= 1.5 ? 0.7 : 0.55;
  const noteY = h >= 1.5 ? 1.15 : 0.95;
  stats.forEach((s, i) => {
    const x = 0.55 + i * (w + gap);
    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x,
      y,
      w,
      h,
      fill: { color: C.surface, transparency: 40 },
      line: { color: C.border, width: 0.5 },
      rectRadius: 0.1,
    });
    slide.addText(s.label, {
      x: x + 0.2,
      y: y + 0.12,
      w: w - 0.4,
      h: 0.28,
      fontFace: MONO,
      fontSize: 10,
      color: C.accent,
      bold: true,
      charSpacing: 2,
    });
    slide.addText(s.value, {
      x: x + 0.2,
      y: y + 0.4,
      w: w - 0.4,
      h: valueH,
      fontFace: MONO,
      fontSize: valueFont,
      color: C.text1,
      bold: true,
      charSpacing: -2,
    });
    slide.addText(s.note, {
      x: x + 0.2,
      y: y + noteY,
      w: w - 0.4,
      h: 0.4,
      fontFace: FONT,
      fontSize: 10.5,
      color: C.text2,
      valign: "top",
    });
  });
}

/**
 * Add the speaker-notes text the presenter sees off-screen during the Live.
 */
function notes(slide, text) {
  slide.addNotes(text);
}

// =========================================================
// SLIDE 01 — TITLE
// =========================================================
{
  const s = pptx.addSlide({ masterName: "BASE" });
  pageChip(s, 1);

  s.addText("● LIVE · portfolio walkthrough", {
    x: 0.55,
    y: 2.9,
    w: 6,
    h: 0.4,
    fontFace: MONO,
    fontSize: 12,
    color: C.accent,
    charSpacing: 3,
  });

  s.addText("Running a local-first", {
    x: 0.55,
    y: 3.25,
    w: 11,
    h: 1.1,
    fontFace: FONT,
    fontSize: 64,
    color: C.text1,
    bold: true,
    charSpacing: -2,
  });
  s.addText(
    [
      { text: "support agent ", options: { color: C.text1 } },
      { text: "on a Mac.", options: { color: C.accent } },
    ],
    {
      x: 0.55,
      y: 4.25,
      w: 11,
      h: 1.1,
      fontFace: FONT,
      fontSize: 64,
      bold: true,
      charSpacing: -2,
    },
  );

  s.addText(
    "How AssistSupport drafts KB-grounded IT support responses in under 25 ms — without a single query leaving the laptop.",
    {
      x: 0.55,
      y: 5.6,
      w: 10,
      h: 0.9,
      fontFace: FONT,
      fontSize: 15,
      color: C.text2,
      valign: "top",
    },
  );

  // Speaker chip
  s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 0.55,
    y: 6.55,
    w: 5.2,
    h: 0.5,
    fill: { color: C.surface, transparency: 30 },
    line: { color: C.border, width: 0.5 },
    rectRadius: 0.08,
  });
  s.addText(
    [
      { text: "Saagar Patel", options: { color: C.text1, bold: true } },
      { text: "  ·  IT Platform Eng · Box", options: { color: C.text3 } },
    ],
    {
      x: 0.75,
      y: 6.55,
      w: 5,
      h: 0.5,
      fontFace: FONT,
      fontSize: 12,
      valign: "middle",
    },
  );

  notes(
    s,
    [
      "Welcome — we're going to walk through AssistSupport, a Tauri + React + Rust IT support assistant that runs entirely on a laptop.",
      "No cloud round trips. No queries leave the machine. The whole ML pipeline — classifier, retrieval, reranker, generation — is local.",
      "Format for the next ~30 minutes: show the product, then the architecture, then what I learned shipping it.",
    ].join("\n"),
  );
}

// =========================================================
// SLIDE 02 — THE PROBLEM
// =========================================================
{
  const s = pptx.addSlide({ masterName: "BASE" });
  pageChip(s, 2);
  eyebrow(s, "CHAPTER 01 · THE PROBLEM");
  title(s, "IT support drowns in the same questions — and cloud AI isn't a clean fix.");

  bullets(
    s,
    [
      "Every IT team repeats itself: ~25% of tickets are policy / howto questions already answered in the KB.",
      "Cloud LLMs promise automation but add three sharp costs: data leaves the tenant, hallucinations look confident, and per-seat pricing compounds.",
      "Vendor assistants hide their routing and retrieval — when they answer wrong, you can't debug why.",
      "The real bar: draft something a human would actually paste into Jira, cite where the claim came from, and be honest when the KB doesn't know.",
    ],
    { y: 2.3, fontSize: 17 },
  );

  notes(
    s,
    "Set the frame: this isn't 'replace IT with AI' — it's 'give IT a second brain that's cheap, auditable, and local'.",
  );
}

// =========================================================
// SLIDE 03 — THE THESIS
// =========================================================
{
  const s = pptx.addSlide({ masterName: "BASE" });
  pageChip(s, 3);
  eyebrow(s, "CHAPTER 02 · THESIS");
  title(s, "A second brain — not a replacement.");

  // Three-pillar grid
  const pillars = [
    {
      head: "LOCAL-FIRST",
      body: "App, sidecar, classifier, retrieval, reranker, and LLM all run on-device. SQLCipher AES-256 at rest. Zero data leaves the machine.",
    },
    {
      head: "KB-GROUNDED",
      body: "Every draft cites real KB articles. Hybrid retrieval over 3,500+ indexed docs; inline [n] markers you can click.",
    },
    {
      head: "TRUST-GATED",
      body: "Confidence modes (answer / clarify / abstain). The model is allowed to refuse when the KB doesn't cover the question.",
    },
  ];
  pillars.forEach((p, i) => {
    const x = 0.55 + i * 4.15;
    s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x,
      y: 2.3,
      w: 4,
      h: 3.4,
      fill: { color: C.surface, transparency: 40 },
      line: { color: C.border, width: 0.5 },
      rectRadius: 0.12,
    });
    s.addText(`0${i + 1}`, {
      x: x + 0.25,
      y: 2.45,
      w: 1,
      h: 0.4,
      fontFace: MONO,
      fontSize: 12,
      color: C.accent,
      bold: true,
    });
    s.addText(p.head, {
      x: x + 0.25,
      y: 2.9,
      w: 3.6,
      h: 0.5,
      fontFace: FONT,
      fontSize: 20,
      color: C.text1,
      bold: true,
      charSpacing: -0.5,
    });
    s.addText(p.body, {
      x: x + 0.25,
      y: 3.55,
      w: 3.6,
      h: 2,
      fontFace: FONT,
      fontSize: 13,
      color: C.text2,
      valign: "top",
    });
  });

  s.addText(
    "You don't need a foundation model on every desk. You need a pipeline that knows the KB cold, runs fast, and keeps the operator in the loop.",
    {
      x: 0.55,
      y: 6.0,
      w: W - 1.1,
      h: 0.8,
      fontFace: FONT,
      fontSize: 15,
      color: C.text2,
      italic: true,
      valign: "top",
    },
  );

  notes(
    s,
    "Frame the three pillars. They map 1:1 to the feature pillars on the one-pager.",
  );
}

// =========================================================
// SLIDE 04 — ARCHITECTURE
// =========================================================
{
  const s = pptx.addSlide({ masterName: "BASE" });
  pageChip(s, 4);
  eyebrow(s, "CHAPTER 03 · ARCHITECTURE");
  title(s, "The pipeline — five stages, all local.");

  // 5-stage pipeline diagram
  const stages = [
    { label: "INTENT", sub: "logreg", time: "3 ms" },
    { label: "RETRIEVE", sub: "TF-IDF", time: "22 ms" },
    { label: "RERANK", sub: "MiniLM", time: "48 ms" },
    { label: "DRAFT", sub: "llama3.1-8b", time: "1.2 s" },
    { label: "LEARN", sub: "feedback", time: "loop" },
  ];
  const boxW = 2.2;
  const gap = 0.3;
  const totalW = boxW * stages.length + gap * (stages.length - 1);
  const startX = (W - totalW) / 2;
  const stageY = 2.6;

  stages.forEach((st, i) => {
    const x = startX + i * (boxW + gap);
    const isActive = i === 3;
    s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x,
      y: stageY,
      w: boxW,
      h: 1.5,
      fill: {
        color: isActive ? C.accent : C.surface,
        transparency: isActive ? 70 : 40,
      },
      line: {
        color: isActive ? C.accent : C.border,
        width: isActive ? 1.25 : 0.5,
      },
      rectRadius: 0.12,
    });
    s.addText(st.label, {
      x,
      y: stageY + 0.2,
      w: boxW,
      h: 0.35,
      fontFace: MONO,
      fontSize: 11,
      color: isActive ? C.accent : C.text3,
      bold: true,
      align: "center",
      charSpacing: 3,
    });
    s.addText(st.sub, {
      x,
      y: stageY + 0.6,
      w: boxW,
      h: 0.4,
      fontFace: FONT,
      fontSize: 17,
      color: C.text1,
      bold: true,
      align: "center",
    });
    s.addText(st.time, {
      x,
      y: stageY + 1.05,
      w: boxW,
      h: 0.35,
      fontFace: MONO,
      fontSize: 12,
      color: C.text2,
      align: "center",
    });
    // Arrow between boxes
    if (i < stages.length - 1) {
      s.addShape(pptx.shapes.RIGHT_TRIANGLE, {
        x: x + boxW + 0.06,
        y: stageY + 0.65,
        w: 0.2,
        h: 0.2,
        fill: { color: C.accent },
        line: { color: C.accent, width: 0 },
        rotate: 90,
      });
    }
  });

  // Context tray below pipeline
  s.addText(
    [
      {
        text: "Runtime: ",
        options: { color: C.text3, bold: true, charSpacing: 2 },
      },
      { text: "Tauri 2 shell · Rust sidecar · React 19 frontend · Ollama (llama3.1-8b) · SQLCipher SQLite", options: { color: C.text2 } },
    ],
    {
      x: 0.55,
      y: 4.6,
      w: W - 1.1,
      h: 0.5,
      fontFace: FONT,
      fontSize: 13,
      valign: "top",
    },
  );

  statRow(
    s,
    [
      { label: "END-TO-END P95", value: "1.8s", note: "full draft, hybrid search + 8B token gen" },
      { label: "P50 HYBRID SEARCH", value: "22ms", note: "TF-IDF + MiniLM-L6 rerank" },
      { label: "MEMORY FOOTPRINT", value: "~5GB", note: "llama3.1-8b q4 + app + indexes" },
      { label: "DATA EXFIL", value: "0 B", note: "everything stays on the machine" },
    ],
    5.4,
  );

  notes(
    s,
    [
      "Walk through left to right. Emphasize the latency budget — each box is a specific choice (logreg over BERT for intent, MiniLM cross-encoder over dense ANN, llama3.1-8b over 70B).",
      "Close with 'zero bytes leave the machine' — that's the tenant story.",
    ].join("\n"),
  );
}

// =========================================================
// SLIDE 05 — DEMO: THE WORKSPACE
// =========================================================
{
  const s = pptx.addSlide({ masterName: "BASE" });
  pageChip(s, 5);
  eyebrow(s, "CHAPTER 04 · DEMO");
  title(s, "The workspace — composer, answer, triage.");

  // Hero screenshot
  s.addImage({
    path: SHOT("01-workspace.png"),
    x: 0.55,
    y: 2.25,
    w: 8.5,
    h: 5.31, // 16:10 ratio ≈ 8.5 × (1800/2880) = 5.31
    sizing: { type: "contain", w: 8.5, h: 5.31 },
  });

  // Annotation callouts on the right
  const callouts = [
    {
      n: "01",
      head: "Composer",
      body: "Paste a ticket, pick the intent chip, set response length — ⌘↵ generates a draft.",
    },
    {
      n: "02",
      head: "Hero answer",
      body: "16px / 1.65 prose at 70ch. Inline [n] pills click through to the cited source.",
    },
    {
      n: "03",
      head: "Triage rail",
      body: "Workflow · signals · alternatives · feedback · context — all in one column.",
    },
  ];
  callouts.forEach((c, i) => {
    const y = 2.3 + i * 1.8;
    s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: 9.4,
      y,
      w: 3.4,
      h: 1.65,
      fill: { color: C.surface, transparency: 40 },
      line: { color: C.border, width: 0.5 },
      rectRadius: 0.1,
    });
    s.addText(c.n, {
      x: 9.55,
      y: y + 0.1,
      w: 0.6,
      h: 0.3,
      fontFace: MONO,
      fontSize: 10,
      color: C.accent,
      bold: true,
      charSpacing: 2,
    });
    s.addText(c.head, {
      x: 9.55,
      y: y + 0.4,
      w: 3.1,
      h: 0.35,
      fontFace: FONT,
      fontSize: 15,
      color: C.text1,
      bold: true,
    });
    s.addText(c.body, {
      x: 9.55,
      y: y + 0.78,
      w: 3.1,
      h: 0.85,
      fontFace: FONT,
      fontSize: 11,
      color: C.text2,
      valign: "top",
    });
  });

  notes(
    s,
    "Live demo pause point. Scroll the draft, click a citation, show the hover state on a KB source.",
  );
}

// =========================================================
// SLIDE 06 — ML INTENT
// =========================================================
{
  const s = pptx.addSlide({ masterName: "BASE" });
  pageChip(s, 6);
  eyebrow(s, "CHAPTER 05 · ML INTENT");
  title(s, "Why logreg + TF-IDF beat embeddings here.");

  bullets(
    s,
    [
      "Logistic regression over TF-IDF bigrams — 3 ms on-device, 0.914 macro-F1 across policy / howto / access / incident / runbook.",
      "Calibrated with Platt scaling so the softmax score actually means what it claims — at ≥0.80 the hit rate is 0.88 empirically.",
      "Feature weights are inspectable: every routing decision is a ranked list of tokens, not a dense vector. Easy to debug, retrain.",
      "Dense embeddings would have matched F1 at ~50× the latency and ~500× the model size. Wrong tool for the budget.",
    ],
    { y: 2.3, w: 7.8, fontSize: 14 },
  );

  // Intent screenshot thumb
  s.addImage({
    path: SHOT("03-intent.png"),
    x: 8.6,
    y: 2.3,
    w: 4.2,
    h: 2.63,
    sizing: { type: "contain", w: 4.2, h: 2.63 },
  });
  s.addText("Live classifier trace for AS-4218", {
    x: 8.6,
    y: 4.98,
    w: 4.2,
    h: 0.3,
    fontFace: MONO,
    fontSize: 9,
    color: C.text3,
    align: "center",
  });

  statRow(
    s,
    [
      { label: "MACRO-F1", value: "0.914", note: "40-case eval suite #4812" },
      { label: "LATENCY", value: "3 ms", note: "per ticket, on-device" },
      { label: "MODEL SIZE", value: "4 MB", note: "vs 450MB+ for a small BERT" },
    ],
    5.5,
  );

  notes(
    s,
    "Be ready for the 'why not embeddings' question. The answer: latency budget + auditability. Also note calibration matters more than raw F1 for routing.",
  );
}

// =========================================================
// SLIDE 07 — HYBRID SEARCH
// =========================================================
{
  const s = pptx.addSlide({ masterName: "BASE" });
  pageChip(s, 7);
  eyebrow(s, "CHAPTER 06 · HYBRID SEARCH");
  title(s, "Sub-25 ms retrieval over 3,500+ articles.");

  // Left column: explanation
  bullets(
    s,
    [
      "Stage 1 — TF-IDF returns ~14 candidates in 22 ms. Cheap, deterministic, no GPU.",
      "Stage 2 — ms-marco-MiniLM-L-6-v2 cross-encoder reranks the candidates in 48 ms on CPU.",
      "Top-4 survive into the draft as the LLM's context. Each one carries a citable title + heading path.",
      "The reranker is the quality lever — TF-IDF alone would cite topically relevant but semantically wrong articles.",
    ],
    { y: 2.3, x: 0.55, w: 7, fontSize: 15 },
  );

  // Right: latency breakdown diagram
  s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 7.9,
    y: 2.3,
    w: 4.9,
    h: 3.5,
    fill: { color: C.surface, transparency: 40 },
    line: { color: C.border, width: 0.5 },
    rectRadius: 0.12,
  });
  s.addText("LATENCY BUDGET · p50", {
    x: 8.1,
    y: 2.45,
    w: 4.5,
    h: 0.3,
    fontFace: MONO,
    fontSize: 10,
    color: C.accent,
    bold: true,
    charSpacing: 2,
  });

  const lat = [
    { label: "Intent", v: 3, color: C.info },
    { label: "TF-IDF retrieval", v: 22, color: C.accent },
    { label: "MiniLM rerank", v: 48, color: C.good },
    { label: "Context build", v: 4, color: C.warn },
  ];
  const totalMs = 77;
  lat.forEach((row, i) => {
    const y = 2.85 + i * 0.65;
    s.addText(row.label, {
      x: 8.1,
      y,
      w: 1.8,
      h: 0.4,
      fontFace: FONT,
      fontSize: 12,
      color: C.text2,
      valign: "middle",
    });
    // Bar
    const barW = (row.v / totalMs) * 2.5;
    s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: 9.9,
      y: y + 0.1,
      w: barW,
      h: 0.2,
      fill: { color: row.color },
      line: { color: row.color, width: 0 },
      rectRadius: 0.04,
    });
    s.addText(`${row.v} ms`, {
      x: 12.1,
      y,
      w: 0.7,
      h: 0.4,
      fontFace: MONO,
      fontSize: 11,
      color: C.text1,
      bold: true,
      valign: "middle",
    });
  });

  s.addText("End to retrieval: 77 ms · then LLM draft streams in 1.2 s", {
    x: 8.1,
    y: 5.45,
    w: 4.5,
    h: 0.3,
    fontFace: MONO,
    fontSize: 10,
    color: C.text3,
  });

  statRow(
    s,
    [
      { label: "P50 HYBRID SEARCH", value: "22ms", note: "TF-IDF candidate retrieval" },
      { label: "P95 HYBRID SEARCH", value: "46ms", note: "measured on M3 MBP" },
      { label: "KB ARTICLES", value: "3,500+", note: "local SQLite, 46s reindex" },
    ],
    5.9,
    1.2,
  );

  notes(
    s,
    "Key message: cross-encoder is slow but cheap here because it only sees 14 candidates. That's the architectural trick.",
  );
}

// =========================================================
// SLIDE 08 — TRUST GATING
// =========================================================
{
  const s = pptx.addSlide({ masterName: "BASE" });
  pageChip(s, 8);
  eyebrow(s, "CHAPTER 07 · TRUST GATING");
  title(s, "The model is allowed to say 'I don't know.'");

  // Three mode cards
  const modes = [
    {
      head: "ANSWER",
      color: C.good,
      body: "Confidence ≥ 0.80 and all claims grounded. Draft ships with inline [n] citations.",
    },
    {
      head: "CLARIFY",
      color: C.warn,
      body: "0.60–0.79 or partial grounding. The draft asks one targeted clarifying question back.",
    },
    {
      head: "ABSTAIN",
      color: C.bad,
      body: "Below threshold or unsupported. Flag the ticket as a KB gap candidate and surface to the operator.",
    },
  ];
  modes.forEach((m, i) => {
    const x = 0.55 + i * 4.15;
    s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x,
      y: 2.3,
      w: 4,
      h: 2.4,
      fill: { color: C.surface, transparency: 40 },
      line: { color: m.color, width: 0.75 },
      rectRadius: 0.12,
    });
    s.addText(m.head, {
      x: x + 0.3,
      y: 2.5,
      w: 3.5,
      h: 0.5,
      fontFace: MONO,
      fontSize: 13,
      color: m.color,
      bold: true,
      charSpacing: 3,
    });
    s.addText(m.body, {
      x: x + 0.3,
      y: 3.1,
      w: 3.5,
      h: 1.5,
      fontFace: FONT,
      fontSize: 13,
      color: C.text2,
      valign: "top",
    });
  });

  bullets(
    s,
    [
      "Inline citations are generated into the prompt, not post-hoc — so the model can't cite a doc it didn't see.",
      "Grounded-claims check runs a per-sentence match against retrieved chunks; unsupported sentences get flagged.",
      "Operators thumbs-up / thumbs-down every draft. Thumbs-down feeds straight into the KB gap analyzer (next slide).",
    ],
    { y: 5.0, fontSize: 14 },
  );

  notes(
    s,
    "This is the section that lands with IT security audiences. Emphasize 'grounded' — citations are real files, not invented URLs.",
  );
}

// =========================================================
// SLIDE 09 — SELF-IMPROVING LOOP
// =========================================================
{
  const s = pptx.addSlide({ masterName: "BASE" });
  pageChip(s, 9);
  eyebrow(s, "CHAPTER 08 · FEEDBACK LOOP");
  title(s, "Low-confidence queries become the KB backlog.");

  // KB gap dashboard screenshot
  s.addImage({
    path: SHOT("04-kb-gap.png"),
    x: 0.55,
    y: 2.3,
    w: 7.5,
    h: 4.69,
    sizing: { type: "contain", w: 7.5, h: 4.69 },
  });

  // Right column explanation
  bullets(
    s,
    [
      "Every abstained or low-confidence query lands in a cluster.",
      "Clusters ranked by impact = affected tickets × retrieval miss rate.",
      "Top clusters become a prioritized list of KB articles to write.",
      "Writers fill the gap → next week's confidence distribution shifts right.",
      "The loop is measurable: 14-day view shows grounded-vs-abstained trend.",
    ],
    { x: 8.4, y: 2.3, w: 4.4, h: 4.7, fontSize: 13 },
  );

  notes(
    s,
    "The compound story: every confident draft is a deflection, every abstention is a lead on what to write next. Both outcomes are wins.",
  );
}

// =========================================================
// SLIDE 10 — OPS SURFACE
// =========================================================
{
  const s = pptx.addSlide({ masterName: "BASE" });
  pageChip(s, 10);
  eyebrow(s, "CHAPTER 09 · OPS");
  title(s, "Yes, a desktop app needs a deploy story.");

  // Left: ops screenshot
  s.addImage({
    path: SHOT("05-ops.png"),
    x: 0.55,
    y: 2.3,
    w: 6.2,
    h: 3.87,
    sizing: { type: "contain", w: 6.2, h: 3.87 },
  });
  s.addText("Deploy / rollback surface", {
    x: 0.55,
    y: 6.2,
    w: 6.2,
    h: 0.3,
    fontFace: MONO,
    fontSize: 10,
    color: C.text3,
    align: "center",
  });

  // Right: eval screenshot
  s.addImage({
    path: SHOT("06-eval.png"),
    x: 7.0,
    y: 2.3,
    w: 5.8,
    h: 3.62,
    sizing: { type: "contain", w: 5.8, h: 3.62 },
  });
  s.addText("Eval harness · run #4812", {
    x: 7.0,
    y: 5.95,
    w: 5.8,
    h: 0.3,
    fontFace: MONO,
    fontSize: 10,
    color: C.text3,
    align: "center",
  });

  s.addText(
    "Canary on 10% → guardrails on p95 latency, error rate, and grounding score → auto-promote. 90-second rollback SLO.",
    {
      x: 0.55,
      y: 6.6,
      w: W - 1.1,
      h: 0.5,
      fontFace: FONT,
      fontSize: 14,
      color: C.text2,
      italic: true,
      valign: "top",
    },
  );

  notes(
    s,
    "Talk about the eval gate specifically — grounding ≥ 0.90, faithfulness ≥ 0.95, safety refusals 100%. These are release blockers.",
  );
}

// =========================================================
// SLIDE 11 — WHAT I LEARNED
// =========================================================
{
  const s = pptx.addSlide({ masterName: "BASE" });
  pageChip(s, 11);
  eyebrow(s, "CHAPTER 10 · LESSONS");
  title(s, "Five things I didn't expect.");

  const lessons = [
    {
      n: "01",
      head: "Local-first is a UX decision, not just a security one.",
      body: "Operators trust a tool more when they can literally turn their Wi-Fi off and it still works. The privacy story lands emotionally.",
    },
    {
      n: "02",
      head: "Prompt-cache hits are the real latency win.",
      body: "The intent + retrieval output is cached per-ticket — second generations are 3× faster. Worth more than model quantization.",
    },
    {
      n: "03",
      head: "Logreg is not a downgrade — it's a feature.",
      body: "Inspectable weights mean every routing decision is defensible. 'Why did you send this to the policy lane' has a concrete answer.",
    },
    {
      n: "04",
      head: "Tauri + Rust is the right desktop stack in 2026.",
      body: "Bundle size, Apple notarization, and Rust FFI for the ML sidecar made iteration 2-3× faster than the Electron alternative.",
    },
    {
      n: "05",
      head: "The feedback loop only works if rating is one click.",
      body: "Anything longer than thumbs-up / thumbs-down gets skipped. All the KB gap data comes from that single-click surface.",
    },
  ];
  lessons.forEach((l, i) => {
    const y = 2.3 + i * 0.88;
    s.addText(l.n, {
      x: 0.55,
      y,
      w: 0.7,
      h: 0.5,
      fontFace: MONO,
      fontSize: 16,
      color: C.accent,
      bold: true,
      valign: "top",
    });
    s.addText(l.head, {
      x: 1.3,
      y: y - 0.05,
      w: 11.5,
      h: 0.45,
      fontFace: FONT,
      fontSize: 16,
      color: C.text1,
      bold: true,
      valign: "top",
    });
    s.addText(l.body, {
      x: 1.3,
      y: y + 0.4,
      w: 11.5,
      h: 0.5,
      fontFace: FONT,
      fontSize: 12,
      color: C.text2,
      valign: "top",
    });
  });

  notes(
    s,
    "Pick one to spend extra time on depending on the audience: #1 for IT leaders, #2 for ML eng, #4 for devs.",
  );
}

// =========================================================
// SLIDE 12 — RESOURCES + Q&A
// =========================================================
{
  const s = pptx.addSlide({ masterName: "BASE" });
  pageChip(s, 12);

  s.addText("● THANKS FOR WATCHING", {
    x: 0.55,
    y: 1.2,
    w: 10,
    h: 0.4,
    fontFace: MONO,
    fontSize: 12,
    color: C.accent,
    charSpacing: 3,
  });

  s.addText("Questions?", {
    x: 0.55,
    y: 1.7,
    w: 12,
    h: 1.4,
    fontFace: FONT,
    fontSize: 72,
    color: C.text1,
    bold: true,
    charSpacing: -2,
  });

  s.addText(
    "Open source · MIT licensed · runs on any M-series MacBook with Ollama installed.",
    {
      x: 0.55,
      y: 3.2,
      w: 12,
      h: 0.6,
      fontFace: FONT,
      fontSize: 18,
      color: C.text2,
    },
  );

  // Resource cards
  const resources = [
    {
      label: "REPO",
      value: "github.com/saagpatel/AssistSupport",
      note: "229 commits · v1.2.0 · MIT",
    },
    {
      label: "DECK + ONE-PAGER",
      value: "portfolio drop",
      note: "PDF + slide deck + screenshot set",
    },
    {
      label: "CONNECT",
      value: "in/saagarpatel",
      note: "DMs open — IT platform + local AI",
    },
  ];
  resources.forEach((r, i) => {
    const x = 0.55 + i * 4.15;
    s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x,
      y: 4.3,
      w: 4,
      h: 1.9,
      fill: { color: C.surface, transparency: 40 },
      line: { color: C.border, width: 0.5 },
      rectRadius: 0.12,
    });
    s.addText(r.label, {
      x: x + 0.25,
      y: 4.45,
      w: 3.6,
      h: 0.3,
      fontFace: MONO,
      fontSize: 10,
      color: C.accent,
      bold: true,
      charSpacing: 2,
    });
    s.addText(r.value, {
      x: x + 0.25,
      y: 4.8,
      w: 3.6,
      h: 0.6,
      fontFace: FONT,
      fontSize: 16,
      color: C.text1,
      bold: true,
    });
    s.addText(r.note, {
      x: x + 0.25,
      y: 5.4,
      w: 3.6,
      h: 0.65,
      fontFace: FONT,
      fontSize: 11,
      color: C.text2,
      valign: "top",
    });
  });

  s.addText(
    "Built with Tauri 2 · React 19 · TypeScript · Rust · SQLCipher · Ollama · TF-IDF + MiniLM-L-6-v2 · logreg intent classifier",
    {
      x: 0.55,
      y: 6.5,
      w: W - 1.1,
      h: 0.5,
      fontFace: MONO,
      fontSize: 11,
      color: C.text3,
      align: "center",
      charSpacing: 1,
    },
  );

  notes(
    s,
    "Leave this on screen for the full Q&A window. Repeat the repo URL verbally once or twice.",
  );
}

// =========================================================
// WRITE
// =========================================================
const outPath = join(__dirname, "AssistSupport-LinkedIn-Live.pptx");
await pptx.writeFile({ fileName: outPath });
console.log(`✓ wrote ${outPath}`);
