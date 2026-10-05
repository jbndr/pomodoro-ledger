import { expect, test } from "@playwright/test";

// Runs a whole cycle on a fake clock, keeps going past the bell, and checks the overtime lands in the ledger and the break.
test("keep going past the bell", async ({ page, isMobile }) => {
  test.skip(isMobile, "Same logic on phones; the desktop run covers it");
  await page.clock.install({ time: new Date("2026-10-05T10:00:00") });
  await page.goto("/?demo=1");
  await page.locator(".task").first().waitFor({ state: "attached" });
  await page.clock.runFor(3000);
  for (let i = 0; i < 3 && (await page.locator(".overlay:not([hidden])").count()); i++) await page.keyboard.press("Escape");

  await page.locator("#startBtn").click();
  await page.clock.fastForward(25 * 60_000 + 2000); await page.clock.runFor(500);
  const keep = page.locator(".keep-going");
  await expect(keep).toBeVisible();

  await page.keyboard.press("o");
  await expect(page.locator("#startBtn")).toContainText("Stop");
  await page.clock.fastForward(12 * 60_000); await page.clock.runFor(500);
  await expect(page.locator("#time")).toHaveText(/^\+1[23]:\d\d$/);
  await expect(page.locator("#dialSub")).toHaveText("past the bell");

  await page.locator("#startBtn").click();
  await expect(page.locator("#toast")).toContainText("past the bell");
  await expect(page.locator("#toast")).toContainText("Your break gets 2 more minutes.");
  await expect(page.locator("#startBtn")).not.toContainText("Stop");
  await expect(keep).toHaveCount(0);
});

test("keep going is offered only for ten minutes", async ({ page, isMobile }) => {
  test.skip(isMobile, "Same logic on phones");
  await page.clock.install({ time: new Date("2026-10-05T10:00:00") });
  await page.goto("/?demo=1");
  await page.locator(".task").first().waitFor({ state: "attached" });
  await page.clock.runFor(3000);
  for (let i = 0; i < 3 && (await page.locator(".overlay:not([hidden])").count()); i++) await page.keyboard.press("Escape");
  await page.locator("#startBtn").click();
  await page.clock.fastForward(25 * 60_000 + 2000); await page.clock.runFor(500);
  await page.clock.fastForward(11 * 60_000); await page.clock.runFor(500);
  await page.keyboard.press("o");
  await expect(page.locator("#toast")).toContainText("ten minutes");
  await expect(page.locator("#startBtn")).not.toContainText("Stop");
});
