/**
 * generate.mjs — render one-pager.html to landscape-letter PDF + 2× PNG
 * preview via headless Chromium.
 *
 * Run from the repo root:
 *     node docs/one-pager/generate.mjs
 *
 * Outputs:
 *   docs/one-pager/AssistSupport-one-pager.pdf (11in × 8.5in landscape)
 *   docs/one-pager/AssistSupport-one-pager.png (2112 × 1632 preview, 2×)
 */

import { chromium } from "@playwright/test";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, "one-pager.html");
const PDF = join(__dirname, "AssistSupport-one-pager.pdf");
const PNG = join(__dirname, "AssistSupport-one-pager.png");

const CSS_W = 1056; // 11in @ 96dpi
const CSS_H = 816;  //  8.5in @ 96dpi

const browser = await chromium.launch();

// --- PNG preview (2× raster) ---
{
  const ctx = await browser.newContext({
    viewport: { width: CSS_W, height: CSS_H },
    deviceScaleFactor: 2,
    colorScheme: "dark",
  });
  const page = await ctx.newPage();
  await page.goto(pathToFileURL(SRC).href, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  await page.screenshot({
    path: PNG,
    clip: { x: 0, y: 0, width: CSS_W, height: CSS_H },
  });
  await ctx.close();
  console.log(`✓ ${PNG}  (2× PNG preview)`);
}

// --- PDF (vector, landscape-letter) ---
{
  const ctx = await browser.newContext({
    viewport: { width: CSS_W, height: CSS_H },
    colorScheme: "dark",
  });
  const page = await ctx.newPage();
  await page.goto(pathToFileURL(SRC).href, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  await page.pdf({
    path: PDF,
    format: "Letter",
    landscape: true,
    printBackground: true,
    margin: { top: "0", right: "0", bottom: "0", left: "0" },
    preferCSSPageSize: true,
  });
  await ctx.close();
  console.log(`✓ ${PDF}  (11in × 8.5in landscape)`);
}

await browser.close();
