import { expect, test, type Page } from "@playwright/test";

const MIN = 60_000;
// Monday 12 October 2026, before a weekday-morning best time of 9–11.
const NOW = new Date(2026, 9, 12, 8, 10).getTime();
const day = (d: number) => new Date(2026, 9, 12 + d).getTime();
const key = (t: number) => new Date(t).toLocaleDateString("sv");

function ledger() {
  const history = [];
  for (let d = -84; d < 0; d++) {
    if (new Date(day(d)).getDay() % 6 === 0) continue;
    const sessions = [0, 1, 2, 3].map((i) => ({ at: day(d) + (9 * 60 + 25 + i * 30) * MIN, ms: 25 * MIN, full: true }));
    history.push({ id: "h" + (d + 100), title: "Earlier", est: 4, done: true, doneAt: day(d) + 17 * 60 * MIN, createdAt: day(d), sessions });
  }
  const today = ([["a", "Reply to emails", 1], ["b", "Review pull requests", 2], ["c", "Standup notes", 1], ["d", "Write the quarterly report", 4]] as const)
    .map(([id, title, est], order) => ({ id, title, est, order, today: true, plan: key(NOW), createdAt: day(-1), sessions: [] }));
  return [...history, ...today];
}

async function open(page: Page) {
  await page.route("**/api/**", (r) => r.fulfill({ status: 404, body: "{}" }));
  await page.clock.install({ time: NOW });
  await page.addInitScript(([tasks, today]) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("pl.tasks", JSON.stringify(tasks));
    localStorage.setItem("pl.settings", JSON.stringify({ weeklyPlan: false, weeklyRecap: false }));
    localStorage.setItem("pl.day", JSON.stringify(today));
    // The backup banner arrives a few seconds in and would shift the list mid-drag.
    localStorage.setItem("pl.backup", JSON.stringify({ off: true }));
  }, [ledger(), key(NOW)] as const);
  await page.goto("/app/");
  await page.locator(".task").first().waitFor({ state: "attached" });
  for (let i = 0; i < 3 && (await page.locator(".overlay:not([hidden])").count()); i++) await page.keyboard.press("Escape");
  const tab = page.locator('button[data-page="tasks"]');
  if (await tab.isVisible()) await tab.click();
}

test("Best time stays out of the way until you turn it on", async ({ page }) => {
  await open(page);
  const btn = page.locator("#bestBtn");
  await expect(btn).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#bestDay")).toBeHidden();
  await expect(page.locator(".best-tag")).toHaveCount(0);
  await expect(page.locator("#bestFit")).toHaveText(/^You focus best 9–11\. Line up “Write the quarterly report” for then\?/);
  await btn.click();
  await expect(btn).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#bestDay")).toBeVisible();
  await expect(page.locator(".best-tag")).toHaveCount(2);
  await page.reload();
  await page.locator(".task").first().waitFor({ state: "attached" });
  await expect(page.locator("#bestDay")).toBeVisible();
  await page.locator("#bestBtn").click();
  await expect(page.locator("#bestDay")).toBeHidden();
  await expect(page.locator(".best-tag")).toHaveCount(0);
});

test("Today offers to line up the biggest task for your best time", async ({ page }) => {
  await open(page);
  await page.locator("#bestBtn").click();
  const offer = page.locator("#bestFit");
  await expect(page.locator("#bestDay .bd-cap")).toHaveText(/Best time 9–11\s*in 50m/);
  await expect(page.locator("#bestDay .bd-hours .edge")).toHaveText(["9", "11"]);
  await expect(offer).toHaveText(/^Line up “Write the quarterly report” for then\?/);
  await expect(page.locator(".task:has(.best-tag) .tt")).toHaveText(["Review pull requests", "Standup notes"]);
  await page.locator("#bestMove").click();
  await expect(page.locator(".task .tt")).toHaveText(["Reply to emails", "Write the quarterly report", "Review pull requests", "Standup notes"]);
  await expect(page.locator(".task:has(.best-tag) .tt")).toHaveText(["Write the quarterly report"]);
  await expect(page.locator("#toast")).toContainText("Lined up “Write the quarterly report” for your best time");
  await expect(offer).toBeHidden();
});

test("Not today hides the offer until tomorrow", async ({ page }) => {
  await open(page);
  await page.locator("#bestSkip").click();
  await expect(page.locator("#bestFit")).toBeHidden();
  await page.reload();
  await page.locator(".task").first().waitFor({ state: "attached" });
  await expect(page.locator("#bestFit")).toBeHidden();
  await expect(page.locator(".task .tt").nth(3)).toHaveText("Write the quarterly report");
});

test("While you drag a task, the tags show which tasks would land in your best time", async ({ page, isMobile }) => {
  test.skip(isMobile, "Dragging by mouse");
  await open(page);
  await page.locator("#bestBtn").click();
  await page.locator('.task[data-id="d"]').hover();
  const g = (await page.locator('.task[data-id="d"] .grip').boundingBox())!;
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await page.mouse.down();
  // Lifting the task changes the layout, so move up until the slot sits right above "Review pull requests".
  for (let y = g.y + g.height / 2 - 4; y > g.y - 400 && !(await page.locator('.task-drop + .task[data-id="b"]').count()); y -= 8) await page.mouse.move(g.x + g.width / 2, y);
  await expect(page.locator(".task.dragging .best-tag")).toHaveCount(1);
  await expect(page.locator(".task:not(.dragging) .best-tag")).toHaveCount(0);
  await page.mouse.up();
  await expect(page.locator(".task .tt")).toHaveText(["Reply to emails", "Write the quarterly report", "Review pull requests", "Standup notes"]);
  await expect(page.locator(".task:has(.best-tag) .tt")).toHaveText(["Write the quarterly report"]);
});
