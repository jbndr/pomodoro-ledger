import { expect, test, type Page } from "@playwright/test";

async function openSettings(page: Page) {
  await page.clock.install({ time: new Date("2026-10-05T10:00:00") });
  await page.goto("/app/?demo=1");
  await page.locator(".task").first().waitFor({ state: "attached" });
  await page.clock.runFor(3000);
  for (let i = 0; i < 3 && (await page.locator(".overlay:not([hidden])").count()); i++) await page.keyboard.press("Escape");
  await page.locator("#openSettings").click();
  await page.locator("#barMenu .item", { hasText: "Settings" }).click();
  await expect(page.locator("#settings")).toBeVisible();
}
const section = async (page: Page, name: string, isMobile: boolean) => {
  await page.locator(`.st-nav [data-sec="${name}"]`).click();
  if (isMobile) await expect(page.locator(".st-nav")).toBeHidden();
};

test("a longer focus shows on the clock", async ({ page, isMobile }) => {
  await openSettings(page);
  await section(page, "timer", isMobile);
  await page.locator('[aria-label="Focus longer"]').click();
  await expect(page.locator("#len-focus")).toHaveValue("30");
  await expect(page.locator(".st-saved")).toHaveClass(/show/);
  await page.keyboard.press("Escape");
  await expect(page.locator("#settings")).toBeHidden();
  await expect(page.locator("#time")).toHaveText("30:00");
});

test("a nudge is edited in place, one part of its sentence at a time", async ({ page, isMobile }) => {
  test.skip(isMobile, "Same editor on phones");
  await openSettings(page);
  await section(page, "breaks", isMobile);
  const eyes = page.locator(".st-nudge", { hasText: "Rest your eyes" });
  await eyes.locator(".st-nudge-hit").click();
  await expect(eyes).toHaveClass(/open/);
  await eyes.locator(".st-tok").first().click();
  const pop = page.locator(".st-pop");
  await expect(pop).toBeVisible();
  // The picker always opens below its part of the sentence.
  const tok = await eyes.locator(".st-tok").first().boundingBox(), box = await pop.boundingBox();
  expect(box!.y).toBeGreaterThan(tok!.y + tok!.height);
  await pop.locator(".st-pi", { hasText: "Long breaks only" }).click();
  await expect(pop).toBeHidden();
  await expect(eyes.locator(".st-tok").first()).toHaveText("in long breaks");
  await eyes.locator(".st-tok").nth(1).click();
  await pop.locator(".st-pset button", { hasText: "Weekdays" }).click();
  await expect(eyes.locator(".st-tok").nth(1)).toHaveText("on weekdays");
  await page.keyboard.press("Escape");
  await expect(pop).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(eyes).not.toHaveClass(/open/);
  await expect(eyes.locator(".st-nudge-hit small")).toHaveText("Long breaks · Weekdays");
  await expect(page.locator("#settings")).toBeVisible();
});

test("sliding sounds up makes a mix you can save", async ({ page, isMobile }) => {
  await openSettings(page);
  await section(page, "sound", isMobile);
  await page.locator("#openScape").click();
  await page.locator(".st-chip-new").click();
  await page.locator('[aria-label="Rain level"]').fill("70");
  await page.locator('[aria-label="Fire level"]').fill("30");
  await expect(page.locator(".st-snd.on")).toHaveCount(2);
  await page.locator('[aria-label="Fire level"]').fill("0");
  await expect(page.locator(".st-snd.on")).toHaveCount(1);
  await page.locator("#saveMix").click();
  await page.locator('[aria-label="Mix name"]').fill("Rainy desk");
  await page.keyboard.press("Enter");
  await expect(page.locator('.st-chip[aria-checked="true"]')).toHaveText("Rainy desk");
  await page.locator(".st-back").click();
  await expect(page.locator("#openScape")).toContainText("Rainy desk");
});

test("the phase change preview plays the style you point at", async ({ page, isMobile }) => {
  test.skip(isMobile, "Pointing needs a mouse");
  await openSettings(page);
  await section(page, "look", isMobile);
  await page.locator('.st-style[data-morph="clock"]').hover();
  await expect(page.locator(".st-mini .mt").last()).toHaveText("25:00");
  for (let i = 0; i < 4; i++) await page.clock.runFor(500);
  await expect(page.locator(".st-mini .mt").last()).toHaveText("05:00");
  await expect(page.locator('.st-style[data-morph="wipe"]')).toHaveAttribute("aria-checked", "true");
});
