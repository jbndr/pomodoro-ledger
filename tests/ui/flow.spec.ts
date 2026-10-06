import { expect, test, type Page } from "@playwright/test";

async function open(page: Page) {
  await page.clock.install({ time: new Date("2026-10-05T10:00:00") });
  await page.goto("/app/?demo=1");
  await page.locator(".task").first().waitFor({ state: "attached" });
  await page.clock.runFor(3000);
  for (let i = 0; i < 3 && (await page.locator(".overlay:not([hidden])").count()); i++) await page.keyboard.press("Escape");
}

test("a flow session counts up and earns a break that matches", async ({ page, isMobile }) => {
  test.skip(isMobile, "Same logic on phones");
  await open(page);
  await page.locator('.modes [data-mode="flow"]').click();
  await expect(page.locator("#time")).toHaveText("00:00");
  await expect(page.locator("#dialSub")).toHaveText("");
  await page.locator("#startBtn").click();
  await page.clock.fastForward(72 * 60_000); await page.clock.runFor(500);
  await expect(page.locator("#time")).toHaveText(/^72:0\d$/);
  await expect(page.locator("#dialSub")).toContainText("started");
  await expect(page.locator("#startBtn")).toContainText("Stop");
  await page.locator("#startBtn").click();
  await expect(page.locator("#toast")).toContainText("of flow. Take a 14-minute break.");
  await expect(page.locator('.modes [data-mode="short"]')).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#time")).toHaveText(/^1[34]:\d\d$/);
});

test("picking Focus again leaves flow", async ({ page, isMobile }) => {
  test.skip(isMobile, "Same logic on phones");
  await open(page);
  await page.locator('.modes [data-mode="flow"]').click();
  await page.locator('.modes [data-mode="focus"]').click();
  await expect(page.locator("#time")).toHaveText("25:00");
  await expect(page.locator('.modes [data-mode="flow"]')).toHaveAttribute("aria-selected", "false");
});

test("a long flow gets one quiet check-in", async ({ page, isMobile }) => {
  test.skip(isMobile, "Same logic on phones");
  await open(page);
  await page.locator('.modes [data-mode="flow"]').click();
  await page.locator("#startBtn").click();
  await page.clock.fastForward(91 * 60_000); await page.clock.runFor(1500);
  await expect(page.locator("#dialSub")).toHaveText("90 min in flow · a break soon?");
  await expect(page.locator("#startBtn")).toContainText("Stop");
});
