import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

// The same audit used by hand in the browser: every marker next to text, more than 1px off, is listed.
const AUDIT = readFileSync(new URL("../../scripts/align-audit.js", import.meta.url), "utf8");
const audit = (page: Page) => page.evaluate(AUDIT) as Promise<{ name: string; off: number; text: string }[]>;

// A fixed clock keeps the demo data the same on every run; running past the start-up timers lets the
// weekly recap and Year in Focus open, so they can be closed before anything is measured.
test.beforeEach(async ({ page, isMobile }, info) => {
  // Shortcut labels differ by platform (⌘K vs Ctrl K), so one project runs as Windows whatever the host is.
  if (info.project.name === "desktop-windows") await page.addInitScript(() => Object.defineProperty(Navigator.prototype, "platform", { get: () => "Win32" }));
  await page.clock.install({ time: new Date("2026-10-05T10:00:00") });
  await page.goto("/?demo=1");
  await page.locator(".task").first().waitFor({ state: "attached" });
  await page.clock.runFor(3000);
  for (let i = 0; i < 3 && (await page.locator(".overlay:not([hidden])").count()); i++) await page.keyboard.press("Escape");
  await expect(page.locator(".overlay:not([hidden])")).toHaveCount(0);
  if (isMobile) await page.locator('.tabbar [data-page="tasks"]').click();
});

test("task list", async ({ page }) => {
  expect(await audit(page)).toEqual([]);
});

test("label filter open", async ({ page }) => {
  const filter = page.locator("#filterBtn");
  test.skip(!(await filter.isVisible()), "No labels in this view");
  await filter.click();
  expect(await audit(page)).toEqual([]);
});

test("new task focused", async ({ page }) => {
  await page.locator("#newTitle").focus();
  expect(await audit(page)).toEqual([]);
});

test("menu open", async ({ page, isMobile }) => {
  test.skip(isMobile, "The bar stays on the timer page on phones");
  await page.locator("#openSettings").click();
  await expect(page.locator("#barMenu")).toHaveClass(/open/);
  expect(await audit(page)).toEqual([]);
});
