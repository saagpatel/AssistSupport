/**
 * live-capture.mjs — capture portfolio screenshots from the real
 * running app instead of the static HTML mockups under panels/.
 *
 * Starts `pnpm dev` on an isolated port with VITE_E2E_MOCK_TAURI=1
 * so the frontend runs browser-standalone against the IPC mocks in
 * src/test/e2eTauriMock.ts. Flips the workspace hero flag via
 * localStorage so DraftTab renders via WorkspaceHeroLayout. Captures
 * each tab to docs/screenshots/renders/.
 *
 * Panels 1, 2, 4, 5, 6 all map to real tabs and are replaced with
 * live captures. Panel 3 (ML intent confidence view) has no
 * corresponding page in the app and stays as the HTML mockup.
 *
 * Run from the repo root:
 *     node docs/screenshots/live-capture.mjs
 */

import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");
const OUT_DIR = join(__dirname, "renders");

const PORT = 1422;
const URL = `http://localhost:${PORT}`;

const FRAME_W = 1440;
const FRAME_H = 900;
const DPR = 2;

/**
 * Start `pnpm dev` on an isolated port with the Tauri mock enabled,
 * then resolve once Vite reports that it's listening.
 */
async function startDevServer() {
  const child = spawn(
    "pnpm",
    ["dev", "--", "--port", String(PORT)],
    {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        VITE_E2E_MOCK_TAURI: "1",
        VITE_DEV_PORT: String(PORT),
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  let readyResolver;
  const ready = new Promise((r) => (readyResolver = r));

  const onData = (chunk) => {
    const line = chunk.toString();
    process.stdout.write(`  [vite] ${line}`);
    if (line.includes("ready in") || line.includes("Local:")) {
      readyResolver?.();
      readyResolver = null;
    }
  };
  child.stdout.on("data", onData);
  child.stderr.on("data", onData);

  // Best-effort bail on crash
  child.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      console.error(`vite exited with code ${code}`);
      readyResolver?.();
    }
  });

  await ready;
  // Extra grace so HMR and module preload finish — the first
  // navigation without this occasionally hits a blank shell.
  await new Promise((r) => setTimeout(r, 1500));
  return child;
}

/**
 * Seed localStorage with the workspace-hero flag and a minimal
 * onboarding-dismissed marker so the shell renders fully on reload.
 */
async function primeStorage(page) {
  await page.addInitScript(() => {
    // Workspace hero layout — the feature under test.
    localStorage.setItem(
      "assistsupport.flag.ASSISTSUPPORT_REVAMP_WORKSPACE_HERO",
      "1",
    );
    // Admin tabs — policy flag gated by default, but the revamp shell
    // only surfaces the Analytics / Operations nav entries when it is
    // on. In dev mode (Vite serves `MODE=development`), the localStorage
    // override is honored; outside dev it's ignored by the resolver.
    localStorage.setItem(
      "assistsupport.flag.ASSISTSUPPORT_ENABLE_ADMIN_TABS",
      "1",
    );
    localStorage.setItem("assistsupport.onboarding.complete", "1");
  });
}

/**
 * Click a top-level nav item by visible label in the revamp shell.
 */
async function navigate(page, label) {
  const nav = page.locator('.as-shell__nav[aria-label="Primary navigation"]');
  await nav.getByRole("button", { name: label, exact: true }).click();
  // Tab content typically mounts within a frame; give layout a beat.
  await page.waitForTimeout(500);
}

async function capture(page, name) {
  const outPath = join(OUT_DIR, name);
  await page.waitForTimeout(400);
  await page.screenshot({
    path: outPath,
    clip: { x: 0, y: 0, width: FRAME_W, height: FRAME_H },
  });
  console.log(`  ✓ ${name}`);
  return outPath;
}

async function main() {
  console.log("Starting Vite dev server…");
  const server = await startDevServer();

  try {
    console.log("Launching Chromium…");
    const browser = await chromium.launch();
    const context = await browser.newContext({
      viewport: { width: FRAME_W, height: FRAME_H },
      deviceScaleFactor: DPR,
      colorScheme: "dark",
    });
    const page = await context.newPage();
    await primeStorage(page);

    console.log(`Opening ${URL}…`);
    await page.goto(URL, { waitUntil: "networkidle", timeout: 60_000 });
    await page.waitForSelector(".as-shell__nav", { timeout: 30_000 });

    // Diagnostic: capture the landing state before any interaction so a
    // failure inside the workspace flow can be inspected post hoc.
    await page.screenshot({
      path: join(OUT_DIR, "_debug-landing.png"),
      clip: { x: 0, y: 0, width: FRAME_W, height: FRAME_H },
    });

    // ---- Panel 01: Workspace (hero layout) ----
    // The shell renders its own right-rail on the draft tab
    // (WorkspaceQueueContext + Response playbook + AI status cards),
    // which competes with the hero layout's own triage rail. For a
    // clean portfolio capture, hide the shell rail via an injected
    // stylesheet and expand the workspace inner column to fill the
    // freed space. This is presentation-only; no app code changes.
    console.log("Capturing 01-workspace (live)…");
    await page.addStyleTag({
      content: `
        .as-shell__rail { display: none !important; }
        .as-shell__content { grid-template-columns: 1fr !important; }
        .as-shell__workspace { max-width: none !important; }
      `,
    });
    await page.waitForSelector(".wsx__composer", { timeout: 10_000 });

    const ticketText =
      "Priya is flying to the offsite Thursday and wants to bring a USB stick for slide backups. Asking if IT permits it and if so what the approved model is. She's on a company-issued MacBook Pro 14 (M3), macOS 14.5.";

    // Set the textarea value via the native setter so React picks up the
    // change, bypassing any visibility/editability gates Playwright may
    // apply to elements behind the sticky composer's backdrop filter.
    await page.locator(".wsx__query").evaluate((el, text) => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        "value",
      )?.set;
      setter?.call(el, text);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }, ticketText);

    // Trigger generate — mock IPC resolves with a grounded draft.
    // Use dispatchEvent since the button sits behind the sticky
    // composer's backdrop filter and Playwright's hit-test is unreliable.
    await page
      .locator(".wsx__btn--primary")
      .filter({ hasText: "Generate" })
      .evaluate((btn) =>
        btn.dispatchEvent(new MouseEvent("click", { bubbles: true })),
      );
    // Wait for the prose to appear.
    await page.waitForSelector(".wsx__prose p", { timeout: 15_000 });
    await page.waitForTimeout(600);
    await capture(page, "01-workspace.png");

    // ---- Panel 02: Queue ----
    console.log("Capturing 02-queue (live)…");
    await navigate(page, "Queue");
    await page.waitForTimeout(800);
    await capture(page, "02-queue.png");

    // ---- Panel 04: KB gap analysis (inside Analytics) ----
    console.log("Capturing 04-kb-gap (live)…");
    await navigate(page, "Analytics");
    await page.waitForTimeout(800);
    // Scroll the KB gap panel into view if present.
    const kbGap = page.locator(".kb-gap-panel").first();
    if (await kbGap.count()) {
      await kbGap.scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
    }
    await capture(page, "04-kb-gap.png");

    // ---- Panel 05: Ops (deploy/rollback) ----
    console.log("Capturing 05-ops (live)…");
    await navigate(page, "Operations");
    await page.waitForTimeout(800);
    await capture(page, "05-ops.png");

    // Panel 06 (eval harness) intentionally NOT captured from the live
    // app: OpsTab.tsx explicitly notes "Eval, triage, and runbook tools
    // stay out of the active UI in this wave." The HTML mockup at
    // panels/06-eval.html remains the canonical portfolio panel for
    // that feature until a real eval surface ships.

    await browser.close();
    console.log("✓ Live captures written to", OUT_DIR);
  } finally {
    // Kill the dev server cleanly.
    console.log("Stopping Vite dev server…");
    server.kill("SIGINT");
    // Give it a moment, then SIGKILL if still running.
    await new Promise((r) => setTimeout(r, 1000));
    if (!server.killed) server.kill("SIGKILL");
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
