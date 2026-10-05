import { expect, test } from "@playwright/test";

// A cycle on a fake clock ends in a break that carries one nudge; ticking it marks it done.
test("a break carries one body nudge you can tick", async ({ page, isMobile }) => {
  test.skip(isMobile, "Same logic on phones");
  await page.clock.install({ time: new Date("2026-10-05T10:00:00") });
  await page.goto("/?demo=1");
  await page.locator(".task").first().waitFor({ state: "attached" });
  await page.clock.runFor(3000);
  for (let i = 0; i < 3 && (await page.locator(".overlay:not([hidden])").count()); i++) await page.keyboard.press("Escape");
  await page.locator("#startBtn").click();
  await page.clock.fastForward(25 * 60_000 + 2000); await page.clock.runFor(500);
  const nudge = page.locator(".dial-center .nudge");
  await expect(nudge).toContainText("Rest your eyes");
  await nudge.click();
  await expect(nudge).toHaveClass(/done/);
  await expect(nudge).toBeDisabled();
});

test("your own nudge can be added in Settings", async ({ page, isMobile }) => {
  test.skip(isMobile, "Same logic on phones");
  await page.clock.install({ time: new Date("2026-10-05T10:00:00") });
  await page.goto("/?demo=1");
  await page.locator(".task").first().waitFor({ state: "attached" });
  await page.clock.runFor(3000);
  for (let i = 0; i < 3 && (await page.locator(".overlay:not([hidden])").count()); i++) await page.keyboard.press("Escape");
  await page.locator("#openSettings").click();
  await page.locator("#barMenu .item", { hasText: "Settings" }).click();
  await page.locator('[data-tab="auto"]').click();
  const add = page.locator(".nudge-add input");
  await add.fill("5 push-ups");
  await add.press("Enter");
  await expect(page.locator(".nudge-row", { hasText: "5 push-ups" })).toBeVisible();
  await expect(page.locator(".nudge-row")).toHaveCount(4);
});
