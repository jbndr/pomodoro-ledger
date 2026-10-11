import { expect, test, type Page } from "@playwright/test";

async function customize(page: Page) {
  await page.locator(".timer-card .dial-wrap").dispatchEvent("contextmenu");
  await expect(page.locator(".cz")).toBeVisible();
}

test("a mix of your own is saved as a look to pick again, and deleted", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-05T10:00:00") });
  await page.goto("/app/?demo=1");
  await page.locator(".task").first().waitFor({ state: "attached" });
  await page.clock.runFor(3000);
  for (let i = 0; i < 3 && (await page.locator(".overlay:not([hidden])").count()); i++) await page.keyboard.press("Escape");
  const dial = page.locator(".timer-card .dial-wrap"), save = page.locator(".cz-save"), mine = page.locator(".cz .st-face", { hasText: "Late night" });

  await customize(page);
  await expect(save).toHaveAttribute("aria-disabled", "true");
  await page.locator(".cz-zone-face").click();
  await page.locator('.cz [data-id="nixie"]').click();
  if (await page.locator(".cz-crumb").count()) await page.locator(".cz-crumb button").click();
  await expect(save).toHaveAttribute("aria-disabled", "false");
  await save.click();
  // With a mouse the name is ready to type over; on a touchscreen it's renamed from the hint line.
  if (!(await page.locator(".cz-name").count())) await page.locator(".cz-own button", { hasText: "Rename" }).click();
  await page.locator(".cz-name").fill("Late night");
  await page.keyboard.press("Enter");
  await expect(mine).toHaveAttribute("aria-checked", "true");
  await expect(save).toHaveAttribute("aria-disabled", "true");

  await page.locator(".cz-btn", { hasText: "Cancel" }).click();
  await expect(page.locator(".cz")).toBeHidden();
  await expect(dial).toHaveAttribute("data-face", "classic");

  await customize(page);
  await mine.click();
  await page.locator(".cz-btn", { hasText: "Done" }).click();
  await expect(dial).toHaveAttribute("data-face", "nixie");

  await customize(page);
  await page.locator(".cz-own button", { hasText: "Delete" }).click();
  await expect(mine).toHaveCount(0);
  await expect(save).toHaveAttribute("aria-disabled", "false");
  await expect(save).toBeFocused();
});
