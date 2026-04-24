/**
 * rebuild-contact-sheet.mjs — regenerate the 2×3 contact sheet from
 * whichever PNGs currently sit under renders/ (live captures, mockups,
 * or a mix). Used after a live-capture run that replaces only some
 * panels so the sheet stays in sync without re-rendering mockups.
 *
 * Run from the repo root:
 *     node docs/screenshots/rebuild-contact-sheet.mjs
 */

import { chromium } from "@playwright/test";
import { writeFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RENDERS_DIR = join(__dirname, "renders");

const FRAME_W = 1440;
const FRAME_H = 900;
const DPR = 2;
const tileW = FRAME_W / 2;
const tileH = (FRAME_H * tileW) / FRAME_W;

const panels = readdirSync(RENDERS_DIR)
  .filter((f) => /^0[1-6]-.*\.png$/.test(f))
  .sort();

if (panels.length !== 6) {
  console.error(`Expected 6 panel PNGs under ${RENDERS_DIR}, found ${panels.length}`);
  process.exit(1);
}

const contactHtml = join(RENDERS_DIR, "contact-sheet.html");
const contactPath = join(RENDERS_DIR, "contact-sheet.png");

writeFileSync(
  contactHtml,
  `<!doctype html><html><head><meta charset="utf-8"/><style>
  :root { color-scheme: dark; }
  html, body { margin: 0; background: #0b0d10; }
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
<div class="sheet">
  ${panels.map((f) => `<div class="tile"><img src="./${f}"/></div>`).join("\n  ")}
</div>
</body></html>`,
);

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: tileW * 2, height: tileH * 3 },
  deviceScaleFactor: DPR,
  colorScheme: "dark",
});
const page = await ctx.newPage();
await page.goto(pathToFileURL(contactHtml).href, { waitUntil: "networkidle" });
await page.waitForTimeout(300);
await page.screenshot({ path: contactPath, fullPage: true });
await browser.close();

console.log(`✓ wrote ${contactPath}`);
