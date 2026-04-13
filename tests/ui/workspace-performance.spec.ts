import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { freezeAppClock } from "./support/freezeAppClock";

const WORKSPACE_READY_MEASURE = "assistsupport:perf:ticket-workspace-ready-ms";

async function navigateToTab(page: Page, label: "Queue") {
  const mobileNav = page.locator(
    '.as-shell__mobileNav[aria-label="Compact navigation"]',
  );
  if (await mobileNav.isVisible()) {
    await mobileNav.getByRole("button", { name: label, exact: true }).click();
    return;
  }

  const mobileTabBar = page.locator(".tab-bar");
  if (await mobileTabBar.isVisible()) {
    await mobileTabBar
      .getByRole("button", { name: label, exact: true })
      .click();
    return;
  }

  const revampNav = page.locator(
    '.as-shell__nav[aria-label="Primary navigation"]',
  );
  if (await revampNav.isVisible()) {
    await revampNav.getByRole("button", { name: label, exact: true }).click();
    return;
  }

  const legacySidebar = page.locator(".sidebar");
  if (await legacySidebar.isVisible()) {
    await legacySidebar
      .getByRole("button", { name: new RegExp(`^${label}`) })
      .click();
    return;
  }

  throw new Error(`Unable to locate navigation control for ${label}`);
}

function writeWorkspaceUiResults(payload: Record<string, number | string>) {
  mkdirSync(".perf-results", { recursive: true });
  writeFileSync(
    ".perf-results/workspace-ui.json",
    `${JSON.stringify(payload, null, 2)}\n`,
  );
}

test("@perf workspace flows stay inside roadmap budgets", async ({ page }) => {
  await freezeAppClock(page);
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto("/");

  await expect(page.locator(".app")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Application Error")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Ticket workspace" }),
  ).toBeVisible();

  await page.waitForFunction(() => {
    const perfState = (
      window as Window & {
        __assistsupportPerf?: { ticketWorkspaceReadyMs?: number };
      }
    ).__assistsupportPerf;
    return typeof perfState?.ticketWorkspaceReadyMs === "number";
  });

  const workspaceReadyMs = await page.evaluate((measureName) => {
    const perfState = (
      window as Window & {
        __assistsupportPerf?: { ticketWorkspaceReadyMs?: number };
      }
    ).__assistsupportPerf;
    const entry = window.performance.getEntriesByName(measureName).at(-1);
    return (
      perfState?.ticketWorkspaceReadyMs ??
      (entry ? Number(entry.duration.toFixed(2)) : null)
    );
  }, WORKSPACE_READY_MEASURE);

  expect(workspaceReadyMs).not.toBeNull();
  expect(workspaceReadyMs ?? Number.POSITIVE_INFINITY).toBeLessThan(1500);

  await navigateToTab(page, "Queue");

  await expect(
    page.getByRole("heading", { name: "Queue Command Center" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Triage", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "History", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Templates", exact: true }),
  ).toBeVisible();

  const batchInput = page.getByLabel("Batch triage input");
  const triageSeed = Array.from({ length: 25 }, (_, index) => {
    const ticketNumber = 1000 + index;
    const issueFamily =
      index % 5 === 0
        ? "VPN timeout"
        : index % 3 === 0
          ? "Access approval"
          : "Printer outage";
    return `INC-${ticketNumber}|${issueFamily} for building ${index % 4 === 0 ? "west" : "east"} floor ${index + 1}`;
  }).join("\n");

  await batchInput.fill(triageSeed);

  const batchTriageStartedAt = performance.now();
  await page.getByRole("button", { name: "Run triage" }).click();
  await expect(
    page.locator(".as-queue__pre").filter({ hasText: "Tickets:" }),
  ).toContainText("Tickets:", {
    timeout: 20_000,
  });
  const batchTriageMs = Number(
    (performance.now() - batchTriageStartedAt).toFixed(2),
  );
  expect(batchTriageMs).toBeLessThan(20000);

  writeWorkspaceUiResults({
    capturedAt: new Date().toISOString(),
    workspaceReadyMs: workspaceReadyMs ?? -1,
    workspaceReadyBudgetMs: 1500,
    queueSurface: "queue-command-center",
    batchTriageMs,
    batchTriageBudgetMs: 20000,
  });
});
