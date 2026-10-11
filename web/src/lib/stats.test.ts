import { describe, expect, it } from "vitest";
import { addDays, sod } from "./dates";
import { dayLabels, dayTotals, estimateAccuracy, heatLevel, spanDays, streaks } from "./stats";
import type { Session, Task, Tasks } from "./tasks";

// Saturday, 3 October 2026.
const NOW = new Date(2026, 9, 3, 15, 30).getTime();
const TODAY = sod(NOW);
const MIN = 60000;
const at = (daysAgo: number, hour = 10) => addDays(TODAY, -daysAgo) + hour * 3600000;
const cycle = (daysAgo: number, extra: Partial<Session> = {}): Session => ({ at: at(daysAgo), ms: 25 * MIN, full: true, ...extra });
const tasks = (...list: Task[]): Tasks => new Map(list.map((t) => [t.id, t]));

describe("dayTotals", () => {
  const days = dayTotals(tasks(
    { id: "a", title: "A", sessions: [cycle(0), cycle(0), { at: at(1), ms: 10 * MIN }] },
    { id: "b", title: "B", sessions: [cycle(8)] },
  ));
  it("adds time and full cycles per day", () => {
    expect(days.get("2026-10-03")).toEqual({ ms: 50 * MIN, cycles: 2 });
    expect(days.get("2026-10-02")).toEqual({ ms: 10 * MIN, cycles: 0 });
  });
});

describe("streaks", () => {
  const run = (...ago: number[]) => dayTotals(tasks({ id: "a", title: "A", sessions: ago.map((d) => cycle(d)) }));
  it("counts back from today, or from yesterday when today has no cycle yet", () => {
    expect(streaks(run(0, 1, 2), TODAY).current).toBe(3);
    expect(streaks(run(1, 2), TODAY).current).toBe(2);
    expect(streaks(run(2, 3), TODAY).current).toBe(0);
  });
  it("finds the best run ever", () => {
    expect(streaks(run(0, 5, 6, 7, 8, 20), TODAY)).toEqual({ current: 1, best: 4 });
    expect(streaks(new Map(), TODAY)).toEqual({ current: 0, best: 0 });
  });
  it("ignores days with only partial sessions", () => {
    const days = dayTotals(tasks({ id: "a", title: "A", sessions: [cycle(0), { at: at(1), ms: 5 * MIN }, cycle(2)] }));
    expect(streaks(days, TODAY)).toEqual({ current: 1, best: 1 });
  });
});

describe("estimateAccuracy", () => {
  it("compares cycles taken to cycles planned for finished tasks", () => {
    const r = estimateAccuracy([
      { id: "a", title: "A", done: true, est: 2, sessions: [cycle(1), cycle(1), cycle(1)] },
      { id: "b", title: "B", done: true, est: 2, sessions: [cycle(1)] },
      { id: "c", title: "C", done: false, est: 5, sessions: [] },
      { id: "d", title: "D", done: true, sessions: [cycle(1)] },
      { id: "e", title: "E", done: true, est: 3, sessions: [] },
    ]);
    expect(r).toEqual({ ratio: 1, diff: 0, count: 2 });
  });
  it("has no ratio before anything with an estimate is finished", () => {
    expect(estimateAccuracy([])).toEqual({ ratio: null, diff: 0, count: 0 });
  });
  it("rounds the difference to whole percent", () => {
    expect(estimateAccuracy([{ id: "a", title: "A", done: true, est: 3, sessions: [cycle(1), cycle(1), cycle(1), cycle(1)] }]).diff).toBe(33);
  });
});

describe("dayLabels", () => {
  it("splits each day's focus by label", () => {
    const m = dayLabels(tasks({ id: "a", title: "A", project: "Docs", sessions: [cycle(0), cycle(0, { project: "Admin" })] }));
    expect([...m.get("2026-10-03")!]).toEqual([["Docs", 25 * MIN], ["Admin", 25 * MIN]]);
  });
});

describe("chart helpers", () => {
  it.each([[0, 0], [10, 1], [30, 2], [100, 3], [200, 4]])("shades %i minutes as level %i", (min, lv) => {
    expect(heatLevel(min)).toBe(lv);
  });
  it("counts a task's span in calendar days, both ends included", () => {
    expect(spanDays({ id: "a", title: "A", doneAt: at(0), sessions: [cycle(3)] })).toBe(4);
    expect(spanDays({ id: "a", title: "A", doneAt: at(0, 23), sessions: [] }, NOW)).toBe(1);
  });
});
