import { test, expect, type Page } from "@playwright/test";
import { freezeAppClock } from "./support/freezeAppClock";

async function expectNoHorizontalOverflow(page: Page) {
  const hasHorizontalOverflow = await page.evaluate(() => {
    const tolerance = 1;
    return document.documentElement.scrollWidth > window.innerWidth + tolerance;
  });
  expect(hasHorizontalOverflow).toBe(false);
}

async function expectDocumentScrollIsContained(page: Page) {
  const metrics = await page.evaluate(() => {
    const tolerance = 1;
    const settingsTab = document.querySelector(".settings-tab");
    return {
      documentScrolls:
        document.documentElement.scrollHeight > window.innerHeight + tolerance,
      settingsTabCanScroll:
        settingsTab instanceof HTMLElement
          ? settingsTab.scrollHeight > settingsTab.clientHeight + tolerance
          : false,
    };
  });

  expect(metrics.documentScrolls).toBe(false);
  expect(metrics.settingsTabCanScroll).toBe(true);
}

async function expectAiReadinessCardsAreContained(page: Page) {
  const metrics = await page.evaluate(() => {
    const tolerance = 1;
    const checks = Array.from(
      document.querySelectorAll<HTMLElement>(".ai-readiness-check"),
    );
    return checks.map((check) => {
      const rect = check.getBoundingClientRect();
      return {
        width: rect.width,
        scrollWidth: check.scrollWidth,
        clientWidth: check.clientWidth,
        overflows: check.scrollWidth > check.clientWidth + tolerance,
        clippedRight: rect.right > window.innerWidth + tolerance,
      };
    });
  });

  expect(metrics).toHaveLength(3);
  for (const metric of metrics) {
    expect(metric.width).toBeGreaterThan(280);
    expect(metric.overflows).toBe(false);
    expect(metric.clippedRight).toBe(false);
  }
}

async function expectMobileDemoSurfacesAreContained(page: Page) {
  const metrics = await page.evaluate(() => {
    const tolerance = 1;
    const nav = document.querySelector<HTMLElement>(".as-shell__mobileNav");
    const sources = Array.from(
      document.querySelectorAll<HTMLElement>(".wsx__source, .cdw .source"),
    );
    const sourceMeta = Array.from(
      document.querySelectorAll<HTMLElement>(
        ".wsx__sourceMeta, .cdw .source__meta",
      ),
    );
    const response = document.querySelector<HTMLElement>(
      '[aria-label="KB-grounded answer"], .cdw .response-body',
    );

    const elementMetrics = (element: HTMLElement) => ({
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      overflows: element.scrollWidth > element.clientWidth + tolerance,
      clippedRight:
        element.getBoundingClientRect().right > window.innerWidth + tolerance,
    });

    return {
      documentOverflows:
        document.documentElement.scrollWidth > window.innerWidth + tolerance,
      nav: nav ? elementMetrics(nav) : null,
      response: response ? elementMetrics(response) : null,
      sources: sources.map(elementMetrics),
      sourceMeta: sourceMeta.map(elementMetrics),
      hasPolicyText: (document.body.textContent ?? "").includes(
        "Removable media is not allowed for Northstar company data",
      ),
    };
  });

  expect(metrics.documentOverflows).toBe(false);
  expect(metrics.nav).not.toBeNull();
  expect(metrics.nav?.overflows).toBe(false);
  expect(metrics.response).not.toBeNull();
  expect(metrics.response?.overflows).toBe(false);
  expect(metrics.sources).toHaveLength(2);
  expect(metrics.sourceMeta).toHaveLength(2);
  for (const metric of [...metrics.sources, ...metrics.sourceMeta]) {
    expect(metric.overflows).toBe(false);
    expect(metric.clippedRight).toBe(false);
  }
  expect(metrics.hasPolicyText).toBe(true);
}

async function navigateToTab(page: Page, label: "Knowledge" | "Settings") {
  const mobileRevampNav = page.locator(
    '.as-shell__mobileNav[aria-label="Compact navigation"]',
  );
  if (await mobileRevampNav.isVisible()) {
    await mobileRevampNav
      .getByRole("button", { name: label, exact: true })
      .click();
    return "mobile-revamp-nav" as const;
  }

  const mobileTabBar = page.locator(".tab-bar");
  if (await mobileTabBar.isVisible()) {
    await mobileTabBar
      .getByRole("button", { name: label, exact: true })
      .click();
    return "tab-bar" as const;
  }

  const revampNav = page.locator(
    '.as-shell__nav[aria-label="Primary navigation"]',
  );
  if (await revampNav.isVisible()) {
    await revampNav.getByRole("button", { name: label, exact: true }).click();
    return "revamp-nav" as const;
  }

  const legacySidebar = page.locator(".sidebar");
  if (await legacySidebar.isVisible()) {
    await legacySidebar
      .getByRole("button", { name: new RegExp(`^${label}`) })
      .click();
    return "sidebar" as const;
  }

  return null;
}

test("@smoke @responsive desktop shell keeps navigation and content in sync", async ({
  page,
}) => {
  await freezeAppClock(page);
  await page.setViewportSize({ width: 1440, height: 560 });
  await page.goto("/");

  await expect(page.locator(".app")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Application Error")).toHaveCount(0);

  const desktopNav = await navigateToTab(page, "Knowledge");
  expect(desktopNav).not.toBeNull();
  await expect(page.locator(".as-shell__pageTitle")).toHaveText(
    "AssistSupport/Knowledge",
  );
  await expect(page.getByRole("tab", { name: "Documents" })).toBeVisible();

  await navigateToTab(page, "Settings");
  await expect(
    page.getByRole("heading", { name: "Operator console" }),
  ).toBeVisible();

  await expectNoHorizontalOverflow(page);
  await expectDocumentScrollIsContained(page);
});

test("@smoke @responsive mobile shell keeps tab-bar navigation usable across tabs", async ({
  page,
}) => {
  await freezeAppClock(page);
  await page.setViewportSize({ width: 390, height: 560 });
  await page.goto("/");

  await expect(page.locator(".app")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Application Error")).toHaveCount(0);
  await expectAiReadinessCardsAreContained(page);
  await expectNoHorizontalOverflow(page);

  await page
    .getByLabel("Ticket or issue description")
    .fill(
      "Jordan in Finance says macOS blocked a USB drive needed for a vendor spreadsheet. Can we allow removable media temporarily?",
    );
  await page.getByRole("button", { name: "Generate ⌘↵" }).click();
  await expect(
    page.getByText("Removable media is not allowed for Northstar company data"),
  ).toBeVisible();
  await expectMobileDemoSurfacesAreContained(page);

  const mobileNav = await navigateToTab(page, "Knowledge");
  expect(mobileNav).not.toBeNull();
  await expect(page.locator(".as-shell__pageTitle")).toHaveText(
    "AssistSupport/Knowledge",
  );
  await expect(page.getByRole("tab", { name: "Documents" })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await navigateToTab(page, "Settings");
  await expect(
    page.getByRole("heading", { name: "Operator console" }),
  ).toBeVisible();

  await expectNoHorizontalOverflow(page);
  await expectDocumentScrollIsContained(page);
});
