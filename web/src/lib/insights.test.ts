import { describe, expect, it } from "vitest";
import { addDays, dayKey, sod } from "./dates";
import { bestWindow, firstWeek, hourGrid, hourSpan, recapDue, relLevel, weekday, weekRecap, weekStart, windowText, type HourGrid } from "./insights";
import type { Session, Task, Tasks } from "./tasks";

// Saturday, 3 October 2026; the week started on Monday 28 September.
const NOW = new Date(2026, 9, 3, 15, 30).getTime();
const MON = new Date(2026, 8, 28).getTime();
const MIN = 60000, HOUR = 60 * MIN;
const tasks = (...list: Task[]): Tasks => new Map(list.map((t) => [t.id, t]));
/** A full cycle ending at `hour`:`min` on the day `day` days after `from`. */
const cycle = (from: number, day: number, hour: number, min = 0, extra: Partial<Session> = {}): Session => ({ at: addDays(from, day) + hour * HOUR + min * MIN, ms: 25 * MIN, full: true, ...extra });

describe("hourGrid", () => {
  it("puts focus under the weekday and hours it ran in", () => {
    const g = hourGrid(tasks({ id: "a", title: "A", sessions: [cycle(MON, 1, 9, 10), cycle(MON, 6, 15, 30)] }));
    expect(g.ms[1][8]).toBe(15 * MIN);
    expect(g.ms[1][9]).toBe(10 * MIN);
    expect(g.ms[6][15]).toBe(25 * MIN);
    expect(g.hours[8] + g.hours[9]).toBe(25 * MIN);
    expect(g).toMatchObject({ total: 50 * MIN, sessions: 2, days: 2 });
  });
  it("only counts sessions that ended in the period", () => {
    const g = hourGrid(tasks({ id: "a", title: "A", sessions: [cycle(MON, -3, 10), cycle(MON, 2, 10)] }), MON, addDays(MON, 7));
    expect(g.sessions).toBe(1);
    expect(g.ms[2][9]).toBe(25 * MIN);
  });
  it("numbers weekdays from Monday", () => {
    expect(weekday(MON)).toBe(0);
    expect(weekday(NOW)).toBe(5);
  });
});

/** A grid with `n` cycles at each of the given weekday/hour slots. */
function grid(slots: [day: number, hour: number, n: number][]): HourGrid {
  const sessions: Session[] = [];
  for (const [day, hour, n] of slots) for (let w = 0; w < n; w++) sessions.push(cycle(addDays(MON, -7 * w), day, hour, 50));
  return hourGrid(tasks({ id: "a", title: "A", sessions }));
}

describe("bestWindow", () => {
  it("needs a few sessions on a few days first", () => {
    expect(bestWindow(grid([[0, 9, 7]]))).toBeNull();
    const sameDays = [0, 9, 10, 11].flatMap((h) => [cycle(MON, 0, h), cycle(MON, 1, h)]);
    expect(bestWindow(hourGrid(tasks({ id: "a", title: "A", sessions: sameDays })))).toBeNull();
    expect(bestWindow(grid([[0, 9, 2], [1, 9, 2], [2, 9, 2], [3, 9, 2]]))).not.toBeNull();
  });
  it("names weekday mornings", () => {
    const w = bestWindow(grid([[0, 9, 4], [0, 10, 4], [1, 9, 4], [2, 10, 4], [3, 9, 3], [4, 15, 1], [5, 16, 1]]))!;
    expect([w.from, w.to, w.days]).toEqual([9, 11, "weekdays"]);
    expect(w.text).toBe("You focus best 9–11 on weekday mornings.");
  });
  it("widens to neighbouring hours that are nearly as busy", () => {
    const w = bestWindow(grid([[0, 9, 4], [1, 10, 4], [2, 11, 4], [3, 9, 4]]))!;
    expect([w.from, w.to]).toEqual([9, 12]);
  });
  it("names weekends and single days", () => {
    expect(bestWindow(grid([[5, 15, 5], [6, 16, 5], [0, 15, 1]]))!.text).toBe("You focus best 15–17 on weekend afternoons.");
    expect(bestWindow(grid([[1, 20, 6], [3, 20, 2], [4, 20, 2], [6, 20, 2]]))!.text).toBe("You focus best 20–21 on Tuesday evenings.");
  });
  it("says so when focus is spread out", () => {
    const w = bestWindow(grid([[0, 8, 3], [1, 11, 3], [2, 14, 3], [3, 17, 3], [4, 20, 3]]))!;
    expect(w.share).toBeLessThan(0.3);
    expect(w.text).toMatch(/^Your focus is spread across the day, most often \d+–\d+\.$/);
  });
});

describe("windowText", () => {
  it.each([
    [9, 11, "weekdays", "You focus best 9–11 on weekday mornings."],
    [14, 16, null, "You focus best 14–16 in the afternoon."],
    [11, 13, "weekdays", "You focus best 11–13 on weekdays around midday."],
    [11, 13, 2, "You focus best 11–13 on Wednesdays around midday."],
    [11, 13, null, "You focus best 11–13 around midday."],
    [22, 24, null, "You focus best 22–24 at night."],
    [18, 20, 4, "You focus best 18–20 on Friday evenings."],
  ] as const)("%i–%i, %s", (from, to, days, text) => {
    expect(windowText(from, to, days, 0.5)).toBe(text);
  });
});

describe("chart helpers", () => {
  it("charts at least 8 to 18 and any hour with focus", () => {
    expect(hourSpan(grid([[0, 10, 1]]))).toEqual({ from: 8, to: 18 });
    expect(hourSpan(grid([[0, 7, 1], [0, 21, 1]]))).toEqual({ from: 7, to: 22 });
  });
  it("shades relative to the busiest cell", () => {
    expect([0, 1, 25, 26, 50, 100].map((v) => relLevel(v, 100))).toEqual([0, 1, 1, 2, 2, 4]);
    expect(relLevel(5, 0)).toBe(0);
  });
});

describe("weekStart", () => {
  it("finds the Monday, or another first weekday", () => {
    expect(weekStart(NOW)).toBe(MON);
    expect(weekStart(MON)).toBe(MON);
    expect(dayKey(weekStart(NOW, 0))).toBe("2026-09-27");
    expect(dayKey(weekStart(sod(new Date(2026, 8, 27).getTime())))).toBe("2026-09-21");
  });
});

describe("weekRecap", () => {
  const LAST = addDays(MON, -7);
  const list = tasks(
    { id: "a", title: "Docs", project: "Writing", done: true, doneAt: addDays(LAST, 2) + 17 * HOUR, sessions: [cycle(LAST, 0, 10), cycle(LAST, 2, 10), cycle(LAST, 2, 11)] },
    { id: "b", title: "Review", project: "Admin", sessions: [cycle(LAST, 4, 9), cycle(LAST, 5, 9, 0, { project: "Writing" }), cycle(LAST, -3, 9), cycle(MON, 0, 9)] },
    { id: "c", title: "Fix", done: true, doneAt: addDays(LAST, 4) + 12 * HOUR, sessions: [{ at: addDays(LAST, 6) + 12 * HOUR, ms: 10 * MIN }] },
    { id: "u", title: "Unplanned focus", system: true, done: true, doneAt: addDays(LAST, 1), sessions: [cycle(LAST, 1, 14)] },
  );
  const r = weekRecap(list, LAST);
  it("adds up the week", () => {
    expect(r.ms).toBe((6 * 25 + 10) * MIN);
    expect(r.cycles).toBe(6);
    expect(r.active).toBe(6);
    expect(r.days.map((d) => d.cycles)).toEqual([1, 1, 2, 0, 1, 1, 0]);
  });
  it("finds the best day and the top labels", () => {
    expect(dayKey(r.best!.t)).toBe("2026-09-23");
    expect(r.labels).toEqual([{ name: "Writing", ms: 100 * MIN }, { name: "", ms: 35 * MIN }, { name: "Admin", ms: 25 * MIN }]);
  });
  it("lists finished tasks in order, without system ones", () => {
    expect(r.finished).toEqual(["Docs", "Fix"]);
  });
  it("compares with the week before and keeps the streak", () => {
    expect(r.before).toEqual({ ms: 25 * MIN, cycles: 1 });
    expect(r.streak).toBe(2);
  });
  it("has no best day or labels for an empty or unlabeled week", () => {
    const empty = weekRecap(list, addDays(LAST, -21));
    expect([empty.ms, empty.best, empty.labels]).toEqual([0, null, []]);
    expect(weekRecap(tasks({ id: "a", title: "A", sessions: [cycle(LAST, 1, 9)] }), LAST).labels).toEqual([]);
  });
});

describe("recapDue", () => {
  const list = tasks({ id: "a", title: "A", sessions: [cycle(addDays(MON, -7), 3, 10)] });
  it("opens last week once per new week", () => {
    expect(recapDue(list, NOW, undefined)).toBe(addDays(MON, -7));
    expect(recapDue(list, NOW, "2026-09-21")).toBe(addDays(MON, -7));
    expect(recapDue(list, NOW, "2026-09-28")).toBeNull();
  });
  it("skips a week without focus", () => {
    expect(recapDue(list, addDays(NOW, 7), undefined)).toBeNull();
    expect(recapDue(tasks(), NOW, undefined)).toBeNull();
  });
  it("finds the first week with focus", () => {
    expect(firstWeek(list)).toBe(addDays(MON, -7));
    expect(firstWeek(tasks())).toBeNull();
  });
});
