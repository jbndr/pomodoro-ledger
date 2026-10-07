import { expect, test } from "@playwright/test";

// A cycle on a fake clock ends in a break that carries one nudge; ticking it marks it done.
test("a break carries one body nudge you can tick", async ({ page, isMobile }) => {
  test.skip(isMobile, "Same logic on phones");
  await page.clock.install({ time: new Date("2026-10-05T10:00:00") });
  await page.goto("/app/?demo=1");
  await page.locator(".task").first().waitFor({ state: "attached" });
  await page.clock.runFor(3000);
  for (let i = 0; i < 3 && (await page.locator(".overlay:not([hidden])").count()); i++) await page.keyboard.press("Escape");
  await page.locator("#startBtn").click();
  await page.clock.fastForward(25 * 60_000 + 2000); await page.clock.runFor(500);
  // One thing at a time: Keep going first, then the nudge in the same spot.
  const nudge = page.locator(".cycle .nudge"), keep = page.locator(".keep-going");
  await expect(keep).toBeVisible();
  await expect(nudge).toHaveCount(0);
  await page.clock.fastForward(61_000); await page.clock.runFor(1500);
  await expect(keep).toHaveCount(0);
  await expect(nudge).toContainText("Rest your eyes");
  await nudge.click();
  await expect(nudge).toHaveClass(/done/);
  await expect(nudge).toBeDisabled();
});

test("your own nudge can be added in Settings", async ({ page, isMobile }) => {
  test.skip(isMobile, "Same logic on phones");
  await page.clock.install({ time: new Date("2026-10-05T10:00:00") });
  await page.goto("/app/?demo=1");
  await page.locator(".task").first().waitFor({ state: "attached" });
  await page.clock.runFor(3000);
  for (let i = 0; i < 3 && (await page.locator(".overlay:not([hidden])").count()); i++) await page.keyboard.press("Escape");
  await page.locator("#openSettings").click();
  await page.locator("#barMenu .item", { hasText: "Settings" }).click();
  await page.locator('.st-nav [data-sec="breaks"]').click();
  const add = page.locator("#nudgeAdd");
  await add.fill("5 push-ups every 2nd break on weekdays");
  await expect(page.locator(".st-nadd-pre")).toContainText("in every 2nd break");
  await add.press("Enter");
  const row = page.locator(".st-nudge", { hasText: "5 push-ups" });
  await expect(row).toContainText("Every 2nd break · Weekdays");
  await expect(page.locator(".st-nudge")).toHaveCount(4);
});
