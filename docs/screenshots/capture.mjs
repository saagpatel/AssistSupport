/**
 * capture.mjs — render each panel HTML under /docs/screenshots/panels
 * to a 2× PNG under /docs/screenshots/out using headless Chromium.
 *
 * Run from the repo root:
 *     node docs/screenshots/capture.mjs
 *
 * Produces six individual 2× PNGs plus a combined 2×3 contact sheet
 * (`contact-sheet.png`) that can be dropped straight into portfolio
 * collateral.
 */

import { chromium } from "@playwright/test";
import { readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PANELS_DIR = join(__dirname, "panels");
const OUT_DIR = join(__dirname, "renders");

const FRAME_W = 1440;
const FRAME_H = 900;
const DPR = 2;

mkdirSync(OUT_DIR, { recursive: true });

const panels = readdirSync(PANELS_DIR)
  .filter((f) => f.endsWith(".html"))
  .sort();

if (panels.length === 0) {
  console.error("No panel HTMLs found under", PANELS_DIR);
  process.exit(1);
}

console.log(`Capturing ${panels.length} panels at ${FRAME_W}×${FRAME_H} @ ${DPR}×`);

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: FRAME_W, height: FRAME_H },
  deviceScaleFactor: DPR,
  colorScheme: "dark",
});
const page = await context.newPage();

const captured = [];

for (const file of panels) {
  const src = join(PANELS_DIR, file);
  const url = pathToFileURL(src).href;
  console.log(` → ${file}`);
  await page.goto(url, { waitUntil: "networkidle" });
  // Give webfonts + any async layout a beat to settle.
  await page.waitForTimeout(400);
  const outName = file.replace(/\.html$/, ".png");
  const outPath = join(OUT_DIR, outName);
  await page.screenshot({
    path: outPath,
    clip: { x: 0, y: 0, width: FRAME_W, height: FRAME_H },
  });
  captured.push({ file, outPath });
}

await browser.close();

// Build a contact sheet (2 cols × 3 rows) so portfolio collateral can
// show the whole set in one image. Each tile is scaled to FRAME_W/2
// CSS px so the sheet matches the individual PNGs' look.
const contactPath = join(OUT_DIR, "contact-sheet.png");
const contactHtml = join(OUT_DIR, "contact-sheet.html");
const tileW = FRAME_W / 2;
const tileH = (FRAME_H * tileW) / FRAME_W;
const tiles = captured
  .map(
    (c) =>
      `<div class="tile"><img src="${c.outPath.replace(/^.+\/out\//, "./")}"/></div>`,
  )
  .join("\n");
writeFileSync(
  contactHtml,
  `<!doctype html><html><head><meta charset="utf-8"/><style>
  :root { color-scheme: dark; }
  html, body { margin:0; background:#0b0d10; }
  .sheet {
    display: grid;
    grid-template-columns: repeat(2, ${tileW}px);
    gap: 0;
    width: ${tileW * 2}px;
  }
  .tile img {
    display: block;
    width: ${tileW}px;
    height: auto;
  }
  </style></head><body>
  <div class="sheet">${tiles}</div>
  </body></html>`,
);

const browser2 = await chromium.launch();
const ctx2 = await browser2.newContext({
  viewport: { width: tileW * 2, height: tileH * 3 },
  deviceScaleFactor: DPR,
  colorScheme: "dark",
});
const p2 = await ctx2.newPage();
await p2.goto(pathToFileURL(contactHtml).href, { waitUntil: "networkidle" });
await p2.waitForTimeout(200);
await p2.screenshot({ path: contactPath, fullPage: true });
await browser2.close();

console.log(`✓ wrote ${captured.length} panels + contact-sheet.png to ${OUT_DIR}`);
