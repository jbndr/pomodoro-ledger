import { expect, test, type Page } from "@playwright/test";

const MIN = 60_000;
// Monday 12 October 2026, 9:00.
const NOW = new Date(2026, 9, 12, 9, 0).getTime();
const day = (d: number) => new Date(2026, 9, 12 + d).getTime();
const key = (t: number) => new Date(t).toLocaleDateString("sv");

/** Writing has taken twice its estimate, code exactly its estimate. */
function ledger() {
  const done = (id: string, project: string, est: number, took: number, d: number) => ({
    id, title: project + " " + id, project, est, done: true, doneAt: day(d) + 17 * 60 * MIN, createdAt: day(d),
    sessions: [...Array(took)].map((_, i) => ({ at: day(d) + (9 * 60 + 25 + i * 30) * MIN, ms: 25 * MIN, full: true })),
  });
  const history = [
    ...[1, 2, 3, 4, 5].map((i) => done("w" + i, "Writing", 2, 4, -i * 2)),
    ...[1, 2, 3, 4].map((i) => done("c" + i, "Code", 2, 2, -i * 2 - 1)),
  ];
  const today = ([["a", "Draft the methods section", "Writing", 3], ["b", "Review the analysis script", "Code", 1]] as const)
    .map(([id, title, project, est], order) => ({ id, title, project, est, order, today: true, plan: key(NOW), createdAt: day(-1), sessions: [] }));
  return [...history, ...today];
}

async function open(page: Page, settings: object = {}) {
  await page.route("**/api/**", (r) => r.fulfill({ status: 404, body: "{}" }));
  await page.clock.install({ time: NOW });
  await page.addInitScript(([tasks, today, settings]) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("pl.tasks", JSON.stringify(tasks));
    localStorage.setItem("pl.settings", JSON.stringify({ weeklyPlan: false, weeklyRecap: false, bestTime: false, ...settings }));
    localStorage.setItem("pl.labels", JSON.stringify([{ name: "Writing" }, { name: "Code" }]));
    localStorage.setItem("pl.day", JSON.stringify(today));
    localStorage.setItem("pl.backup", JSON.stringify({ off: true }));
  }, [ledger(), key(NOW), settings] as const);
  await page.goto("/app/");
  await page.locator(".task").first().waitFor({ state: "attached" });
  for (let i = 0; i < 3 && (await page.locator(".overlay:not([hidden])").count()); i++) await page.keyboard.press("Escape");
  const tab = page.locator('button[data-page="tasks"]');
  if (await tab.isVisible()) await tab.click();
}

test("Today plans with how long tasks really take you", async ({ page }) => {
  await open(page);
  const head = page.locator(".today-head .day-plan");
  await expect(head).toContainText("at your pace");
  // Writing at its learned pace pushes the code review back; 3 cycles as estimated would start it around 10:30.
  const start = page.locator('.task[data-id="b"] .task-start');
  await expect(start).toHaveText(/^Starts ~/);
  const at = (await start.textContent())!.match(/(\d+):(\d+)\s*(PM)?/)!;
  expect(((+at[1] % 12) + (at[3] ? 12 : 0)) * 60 + +at[2]).toBeGreaterThan(11 * 60);
  await expect(page.locator('.task[data-id="a"] .task-start')).toHaveAttribute("title", /Writing tasks take you about 1\.\d× what you plan, so expect ~6 instead of 3\./);
});

test("an open task shows its estimate at your pace, only when it differs", async ({ page }) => {
  await open(page);
  await page.locator('.task[data-id="a"] .task-main').click();
  await expect(page.locator('.task[data-id="a"] .est-pace')).toHaveText(" · ~6 at your pace");
  await page.keyboard.press("Escape");
  await page.locator('.task[data-id="b"] .task-main').click();
  await expect(page.locator('.task[data-id="b"] .task-card')).toBeVisible();
  await expect(page.locator('.task[data-id="b"] .est-pace')).toHaveCount(0);
});

test("turning pace off plans with the estimates as they are", async ({ page }) => {
  await open(page, { pace: false });
  await expect(page.locator(".today-head .day-plan")).not.toContainText("at your pace");
  await expect(page.locator('.task[data-id="b"] .task-start')).toHaveText(/^Starts ~10:30/);
});
