import { expect, test, type Page } from "@playwright/test";

const NOW = new Date(2026, 9, 12, 8, 10).getTime();
const key = new Date(NOW).toLocaleDateString("sv");
const tasks = ([["a", "Reply to emails", ""], ["b", "Standup notes", ""], ["c", "Review pull requests", ""], ["d", "Write the report", "deep"], ["e", "Sketch the outline", "deep"]] as const)
  .map(([id, title, section], order) => ({ id, title, est: 1, order, today: true, plan: key, createdAt: NOW - 864e5, sessions: [], ...(section ? { section } : {}) }));

async function open(page: Page) {
  await page.route("**/api/**", (r) => r.fulfill({ status: 404, body: "{}" }));
  await page.clock.install({ time: NOW });
  await page.addInitScript((tasks) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("pl.tasks", JSON.stringify(tasks));
    localStorage.setItem("pl.settings", JSON.stringify({ weeklyPlan: false, weeklyRecap: false, sections: [{ id: "deep", title: "Deep work" }] }));
    localStorage.setItem("pl.backup", JSON.stringify({ off: true }));
  }, tasks);
  await page.goto("/app/");
  await page.locator(".task").first().waitFor({ state: "attached" });
  for (let i = 0; i < 3 && (await page.locator(".overlay:not([hidden])").count()); i++) await page.keyboard.press("Escape");
}

const rows = (page: Page) => page.locator("#taskList > li").evaluateAll((els) => els.map((el) => (el.classList.contains("section") ? "#" + (el.querySelector<HTMLInputElement>(".sec-title")!.value) : el.classList.contains("task") ? el.getAttribute("aria-label") : "")).filter(Boolean));

test("A section can start at any row and take the rows below it", async ({ page }, info) => {
  test.skip(info.project.name === "phone", "The cut line needs a pointer that hovers.");
  await open(page);
  const row = page.locator('.task[data-id="b"]');
  // The first row of a section has nothing to cut.
  await expect(page.locator('.task[data-id="d"] .sec-cut')).toHaveCount(0);
  const box = (await row.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y - 1);
  await expect(row.locator(".sec-cut")).toHaveCSS("opacity", "1");
  await row.locator(".sec-cut").click();
  await expect(page.locator(".sec-title:focus")).toHaveCount(0);
  await expect(page.locator(".sec-title").first()).toHaveValue("");
  await page.locator(".sec-title").first().fill("Admin");
  await page.keyboard.press("Enter");
  await expect.poll(() => rows(page)).toEqual(["Reply to emails", "#Admin", "Standup notes", "Review pull requests", "#Deep work", "Write the report", "Sketch the outline"]);

  await page.locator(".group.section", { hasText: "" }).nth(1).hover();
  await page.locator('[data-secdel="deep"]').click();
  await expect.poll(() => rows(page)).toEqual(["Reply to emails", "#Admin", "Standup notes", "Review pull requests", "Write the report", "Sketch the outline"]);
});

test("A section needs no name", async ({ page, isMobile }) => {
  await open(page);
  if (isMobile) await page.locator('.tabbar [data-page="tasks"]').click();
  const head = ["Reply to emails", "Standup notes", "Review pull requests"];
  await page.locator("[data-addsec]").click();
  await expect(page.locator(".sec-title:focus")).toHaveValue("");
  await page.keyboard.press("Enter");
  await expect.poll(() => rows(page)).toEqual([...head, "#Deep work", "Write the report", "Sketch the outline", "#"]);

  await page.locator('[data-sec="deep"]').fill("");
  await page.keyboard.press("Enter");
  await expect.poll(() => rows(page)).toEqual([...head, "#", "Write the report", "Sketch the outline", "#"]);
  await page.reload();
  await expect.poll(() => rows(page)).toEqual([...head, "#", "Write the report", "Sketch the outline", "#"]);
  if (isMobile) await page.locator('.tabbar [data-page="tasks"]').click();

  await page.locator('[data-secdel="deep"]').evaluate((b: HTMLButtonElement) => b.click());
  await expect(page.locator("#toast")).toContainText("Removed the section. Its tasks joined Today.");
  await expect.poll(() => rows(page)).toEqual([...head, "Write the report", "Sketch the outline", "#"]);
});
