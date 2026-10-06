import { expect, test, type Page } from "@playwright/test";

async function open(page: Page) {
  await page.clock.install({ time: new Date("2026-10-05T10:00:00") });
  await page.goto("/?demo=1");
  await page.locator(".task").first().waitFor({ state: "attached" });
  await page.clock.runFor(3000);
  for (let i = 0; i < 3 && (await page.locator(".overlay:not([hidden])").count()); i++) await page.keyboard.press("Escape");
}
const held = (page: Page) => page.locator(".modes button[data-held]");
const selected = (page: Page) => page.locator('.modes button[aria-selected="true"]');

// Flow from a running break, then Stop: one break, the one flow earned, and nothing left on hold.
test("flow from a break leaves one break, the one it earned", async ({ page, isMobile }) => {
  test.skip(isMobile, "Same logic on phones");
  await open(page);
  await page.locator("#startBtn").click();
  await page.clock.fastForward(25 * 60_000 + 2000); await page.clock.runFor(500);
  await expect(page.locator('.modes [data-mode="short"]')).toHaveAttribute("aria-selected", "true");
  await page.locator('.modes [data-mode="flow"]').click();
  await page.locator("#startBtn").click();
  await page.clock.fastForward(30 * 60_000); await page.clock.runFor(500);
  await page.locator("#startBtn").click();
  await expect(selected(page)).toHaveCount(1);
  await expect(page.locator('.modes [data-mode="short"]')).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#time")).toHaveText(/^0[56]:\d\d$/);
  await expect(held(page)).toHaveCount(0);
});

// A break put on hold earlier doesn't linger once a new cycle ends.
test("a finished cycle clears breaks left on hold", async ({ page, isMobile }) => {
  test.skip(isMobile, "Same logic on phones");
  await open(page);
  await page.locator('.modes [data-mode="long"]').click();
  await page.locator("#startBtn").click();
  await page.clock.fastForward(60_000); await page.clock.runFor(300);
  await page.locator('.modes [data-mode="focus"]').click();
  await expect(held(page)).toHaveCount(1);
  await page.locator("#startBtn").click();
  await page.clock.fastForward(25 * 60_000 + 2000); await page.clock.runFor(500);
  await expect(held(page)).toHaveCount(0);
});

// Rounds start over after a long pause, so the next session begins at round one.
test("rounds start over after a long pause", async ({ page, isMobile }) => {
  test.skip(isMobile, "Same logic on phones");
  await open(page);
  await page.locator("#startBtn").click();
  await page.clock.fastForward(25 * 60_000 + 2000); await page.clock.runFor(500);
  await page.locator('.modes [data-mode="focus"]').click();
  await expect(page.locator(".cycle")).toContainText("Round 2 of 4");
  await page.clock.fastForward(3 * 3_600_000 + 5 * 60_000); await page.clock.runFor(61_000);
  await expect(page.locator(".cycle")).toContainText("Round 1 of 4");
  await expect(page.locator('.modes [data-mode="focus"]')).toHaveAttribute("aria-selected", "true");
});

test("the round row starts the rounds over by hand", async ({ page, isMobile }) => {
  test.skip(isMobile, "Same logic on phones");
  await open(page);
  await expect(page.locator(".round-reset")).toHaveCount(0);
  await page.locator("#startBtn").click();
  await page.clock.fastForward(25 * 60_000 + 2000); await page.clock.runFor(500);
  await page.locator('.modes [data-mode="focus"]').click();
  await expect(page.locator(".cycle")).toContainText("Round 2 of 4");
  await page.locator(".round-reset").click();
  await expect(page.locator(".cycle")).toContainText("Round 1 of 4");
  await expect(page.locator("#toast")).toContainText("Rounds start over");
  await expect(page.locator(".round-reset")).toHaveCount(0);
});
