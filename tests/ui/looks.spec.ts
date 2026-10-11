import { expect, test, type Page } from "@playwright/test";

async function customize(page: Page) {
  await page.locator(".timer-card .dial-wrap").dispatchEvent("contextmenu");
  await expect(page.locator(".cz")).toBeVisible();
}

test("a mix of your own is saved as a look to pick again, deleted and brought back", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-05T10:00:00") });
  await page.goto("/app/?demo=1");
  await page.locator(".task").first().waitFor({ state: "attached" });
  await page.clock.runFor(3000);
  for (let i = 0; i < 3 && (await page.locator(".overlay:not([hidden])").count()); i++) await page.keyboard.press("Escape");
  const dial = page.locator(".timer-card .dial-wrap"), save = page.locator(".cz-save"), mine = page.locator(".cz .st-face", { hasText: "Late night" });

  await customize(page);
  await expect(save).toHaveAttribute("aria-disabled", "true");
  await page.locator(".cz-zone-face").click();
  await expect(page.locator('.cz-tabs [role="tab"]', { hasText: "Face" })).toHaveAttribute("aria-selected", "true");
  await page.locator('.cz [data-id="nixie"]').click();
  await page.locator('.cz-tabs [role="tab"]', { hasText: "Looks" }).click();
  await expect(save).toHaveAttribute("aria-disabled", "false");
  await save.click();
  // With a mouse the name is ready to type over; on a touchscreen it's renamed with the pencil on the look.
  if (!(await page.locator(".cz-name").count())) await page.getByRole("button", { name: "Rename Nixie" }).click();
  await page.locator(".cz-name").fill("Late night");
  await page.keyboard.press("Enter");
  await expect(mine).toHaveAttribute("aria-checked", "true");
  await expect(save).toHaveAttribute("aria-disabled", "true");

  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.locator(".cz")).toBeHidden();
  await expect(dial).toHaveAttribute("data-face", "classic");

  await customize(page);
  await mine.click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(dial).toHaveAttribute("data-face", "nixie");

  await customize(page);
  await page.getByRole("button", { name: "Delete Late night" }).click();
  await expect(mine).toHaveCount(0);
  await expect(save).toHaveAttribute("aria-disabled", "false");
  await expect(save).toBeFocused();
  await page.locator(".cz-hint button", { hasText: "Undo" }).click();
  await expect(mine).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Delete Late night" }).click();
  await expect(mine).toHaveCount(0);
});
