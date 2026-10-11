import { expect, test, type Page } from "@playwright/test";

const MIN = 60_000;
// Monday 12 October 2026, early afternoon.
const NOW = new Date(2026, 9, 12, 14, 7).getTime();
const day = (d: number) => new Date(2026, 9, 12 + d).getTime();
const key = (t: number) => new Date(t).toLocaleDateString("sv");
const cycle = (d: number, h: number, m: number) => ({ at: day(d) + (h * 60 + m + 25) * MIN, ms: 25 * MIN, full: true, run: (day(d) + (h * 60 + m) * MIN).toString(36) + "abc" });

function ledger() {
  const flowFrom = day(0) + 12 * 60 * MIN;
  return [
    { id: "a", title: "Write the quarterly report", project: "Writing", est: 4, today: true, plan: key(NOW), order: 0, createdAt: day(-3), sessions: [cycle(-1, 9, 0), cycle(0, 9, 0), cycle(0, 9, 30)] },
    { id: "b", title: "Review pull requests", est: 2, today: true, plan: key(NOW), order: 1, createdAt: day(-2), sessions: [cycle(0, 11, 0), { at: flowFrom + 95 * MIN, ms: 95 * MIN, run: "fl-" + flowFrom.toString(36) }] },
    { id: "c", title: "Standup notes", est: 2, today: true, plan: key(NOW), order: 2, createdAt: day(-1), sessions: [] },
  ];
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
    localStorage.setItem("pl.backup", JSON.stringify({ off: true }));
  }, [ledger(), key(NOW)] as const);
  await page.goto("/app/");
  await page.locator(".task").first().waitFor({ state: "attached" });
  for (let i = 0; i < 3 && (await page.locator(".overlay:not([hidden])").count()); i++) await page.keyboard.press("Escape");
}

const insights = async (page: Page) => {
  const tab = page.locator('button[data-page="progress"]');
  if (await tab.isVisible()) await tab.click();
};
const tasks = async (page: Page) => {
  const tab = page.locator('button[data-page="tasks"]');
  if (await tab.isVisible()) await tab.click();
};
const stored = (page: Page, id: string) => page.evaluate((id) => JSON.parse(localStorage.getItem("pl.tasks")!).find((t: { id: string }) => t.id === id).sessions, id);

test("Add a session you forgot to time, clear of the ones you did", async ({ page }) => {
  await open(page);
  await insights(page);
  await page.locator("#addSession").click();
  const form = page.locator(".jn-add .sf");
  await expect(form.locator(".sf-time")).toHaveValue("13:40");
  await expect(form.locator(".sf-len")).toHaveValue("25m");
  await expect(form.locator(".sf-note")).toHaveText(/^Ends 0?2:05\sPM · 1 cycle$/);

  await form.locator(".sf-time").fill("11:10");
  await expect(form.locator(".sf-note")).toHaveText(/^Overlaps 11:00\sAM–11:25\sAM on “Review pull requests”\.$/);
  await expect(form.locator("button[type=submit]")).toBeDisabled();
  await form.locator(".sf-len").fill("3h");
  await form.locator(".sf-time").fill("13:00");
  await expect(form.locator(".sf-note")).toHaveText("That ends in the future.");

  await form.locator(".sf-time").fill("10:00");
  await form.locator(".sf-len").fill("55");
  await expect(form.locator(".sf-note")).toHaveText(/· 2 cycles$/);
  await form.locator(".sf-task").click();
  await page.locator("#pop li", { hasText: "Standup notes" }).click();
  await form.locator("button[type=submit]").click();

  await expect(page.locator("#toast")).toHaveText("Added 55m to “Standup notes”.");
  await expect(page.locator(".jn-add")).toHaveCount(0);
  const row = page.locator(".jn-task.open", { hasText: "Standup notes" });
  await expect(row.locator(".jn-time")).toHaveText(/^10:00\sAM–10:55\sAMBy hand$/);
  await expect(page.locator("#todayLine")).toContainText("5 of 8 cycles today");
  expect(await stored(page, "c")).toEqual([{ at: day(0) + 655 * MIN, ms: 55 * MIN, hand: true, full: true, cycles: 2 }]);

  await tasks(page);
  await page.locator(".task", { hasText: "Standup notes" }).click();
  await expect(page.locator(".card-stats")).toContainText("2 of 2 cycles · 55m focus");
});

test("Fix a flow that ran too long", async ({ page }) => {
  await open(page);
  await insights(page);
  await page.locator(".jn-row", { hasText: "Review pull requests" }).click();
  const flow = page.locator(".jn-s", { hasText: "Flow" });
  await expect(flow.locator(".jn-len")).toHaveText("1h 35m");
  await flow.locator('button[title="Change time"]').click();
  const form = page.locator(".jn-edit .sf");
  await expect(form.locator(".sf-time")).toHaveValue("12:00");
  await form.locator(".sf-len").fill("40m");
  await form.locator(".sf-len").press("Enter");

  await expect(page.locator("#toast")).toHaveText(/^Changed to 12:00\sPM–12:40\sPM, 40m\.$/);
  const fixed = page.locator(".jn-task.open .jn-s").nth(1);
  await expect(fixed.locator(".jn-time")).toHaveText(/^12:00\sPM–12:40\sPMBy hand$/);
  await expect(fixed.locator(".jn-len")).toHaveText("40m");
  await expect(page.locator(".jn-task.open .jn-row")).toBeFocused();
  const [, s] = await stored(page, "b");
  expect(s).toMatchObject({ at: day(0) + 760 * MIN, ms: 40 * MIN, hand: true, full: true, run: expect.stringMatching(/^fl-/) });
  expect(s).not.toHaveProperty("cycles");
});

test("Add a session from the task itself, and Escape leaves it as it was", async ({ page }) => {
  await open(page);
  await tasks(page);
  await page.locator(".task", { hasText: "Standup notes" }).click();
  await page.locator(".card-log").click();
  const form = page.locator(".card-log-form .sf");
  await expect(form.locator(".sf-task")).toHaveCount(0);
  await form.locator(".sf-len").press("Escape");
  await expect(form).toHaveCount(0);
  await expect(page.locator(".card-log")).toBeFocused();

  await page.locator(".card-log").click();
  await form.locator(".sf-time").fill("10:00");
  await form.locator(".sf-len").fill("25m");
  await form.locator("button[type=submit]").click();
  await expect(page.locator("#toast")).toHaveText("Added 25m to “Standup notes”.");
  await expect(page.locator(".card-stats")).toContainText("1 of 2 cycles · 25m focus");
  await expect(page.locator(".task.open .pips i.f")).toHaveCount(1);
});
