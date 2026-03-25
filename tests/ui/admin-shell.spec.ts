import { test, expect } from "@playwright/test";
import { freezeAppClock } from "./support/freezeAppClock";

test("@admin admin shell exposes analytics and operations without reviving pilot", async ({ page }) => {
  await freezeAppClock(page);
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto("/");

  const appShell = page.locator(".app");
  await expect(appShell).toBeVisible({ timeout: 20_000 });

  const nav = page.locator('.as-shell__nav[aria-label="Primary navigation"]');
  await expect(nav.getByRole("button", { name: "Analytics", exact: true })).toBeVisible();
  await expect(nav.getByRole("button", { name: "Operations", exact: true })).toBeVisible();
  await expect(nav.getByRole("button", { name: "Pilot", exact: true })).toHaveCount(0);

  await nav.getByRole("button", { name: "Analytics", exact: true }).click();
  await expect(page.locator(".as-shell__pageTitle")).toHaveText("Analytics");
  await expect(page.getByRole("tab", { name: "Overview" })).toBeVisible();
  await page.getByRole("tab", { name: "Pilot Diagnostics" }).click();
  await expect(page.getByText("Test a Query")).toBeVisible();

  await page.locator(".as-shell__command").click();
  await expect(page.getByText("Go to Analytics")).toBeVisible();
  await expect(page.getByText("Go to Operations")).toBeVisible();
  await expect(page.getByText("Go to Pilot")).toHaveCount(0);
  await page.locator(".command-palette-overlay").click({ position: { x: 4, y: 4 } });
  await expect(page.getByRole("dialog", { name: "Command Palette" })).toHaveCount(0);

  await page.getByRole("button", { name: "Keyboard shortcuts (Cmd+?)" }).click();
  await expect(page.getByText("Go to Analytics")).toBeVisible();
  await expect(page.getByText("Go to Operations")).toBeVisible();
  await expect(page.getByText("Go to Pilot")).toHaveCount(0);
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("dialog", { name: "Keyboard Shortcuts" })).toHaveCount(0);

  await nav.getByRole("button", { name: "Operations", exact: true }).click();
  await expect(page.locator(".as-shell__pageTitle")).toHaveText("Operations");
  await expect(page.getByRole("tab", { name: "Deployment" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Integrations" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Eval Harness" })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Runbook" })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Triage" })).toHaveCount(0);
});
