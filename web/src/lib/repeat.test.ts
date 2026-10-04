import { describe, expect, it } from "vitest";
import { catchUp, cleanRepeat, firstDue, isDue, lastDue, nextDue, nextOccurrence, parseRepeat, repeatShort, repeatText, withRepeat, type Repeat } from "./repeat";
import type { Task } from "./tasks";

// Saturday, 3 October 2026.
const NOW = new Date(2026, 9, 3, 15, 30).getTime();
const TK = "2026-10-03";
const DAILY: Repeat = { every: "day" }, WEEKDAYS: Repeat = { every: "weekday" }, MON_THU: Repeat = { every: "week", days: [1, 4] };

describe("parseRepeat", () => {
  it.each([
    ["every day", { every: "day" }], ["daily", { every: "day" }], ["Every Day", { every: "day" }], ["täglich", { every: "day" }],
    ["every weekday", { every: "weekday" }], ["every workday", { every: "weekday" }], ["werktags", { every: "weekday" }],
    ["every week", { every: "week", days: [6] }], ["weekly", { every: "week", days: [6] }],
    ["every mon", { every: "week", days: [1] }], ["every mon wed", { every: "week", days: [1, 3] }],
    ["every wed, mon", { every: "week", days: [1, 3] }], ["every monday and thursday", { every: "week", days: [1, 4] }],
    ["every sun & sat", { every: "week", days: [6, 0] }], ["on mondays", { every: "week", days: [1] }], ["jeden freitag", { every: "week", days: [5] }],
    ["every weekend", { every: "week", days: [6, 0] }],
    ["every month", { every: "month", date: 3 }], ["monthly", { every: "month", date: 3 }],
    ["every 15th", { every: "month", date: 15 }], ["every month on the 1st", { every: "month", date: 1 }],
  ])("reads %j", (q, expected) => {
    expect(parseRepeat(q, NOW)).toEqual(expected);
  });

  it.each(["every", "every mon itor", "every 32nd", "monday", "each", "every few days", "tomorrow"])("rejects %j", (q) => {
    expect(parseRepeat(q, NOW)).toBeUndefined();
  });
});

describe("due days", () => {
  it("knows which days a rule falls on", () => {
    expect(isDue(WEEKDAYS, "2026-10-03")).toBe(false);
    expect(isDue(WEEKDAYS, "2026-10-05")).toBe(true);
    expect(isDue(MON_THU, "2026-10-08")).toBe(true);
    expect(isDue(MON_THU, "2026-10-07")).toBe(false);
  });

  it("moves a day of the month past the end of a short month to its last day", () => {
    const r: Repeat = { every: "month", date: 31 };
    expect(nextDue(r, "2026-10-31")).toBe("2026-11-30");
    expect(nextDue(r, "2026-11-30")).toBe("2026-12-31");
    expect(nextDue({ every: "month", date: 30 }, "2027-01-30")).toBe("2027-02-28");
  });

  it("finds the next, first and last due day", () => {
    expect(nextDue(DAILY, TK)).toBe("2026-10-04");
    expect(nextDue(WEEKDAYS, "2026-10-02")).toBe("2026-10-05");
    expect(nextDue(MON_THU, "2026-10-05")).toBe("2026-10-08");
    expect(firstDue(MON_THU, "2026-10-05")).toBe("2026-10-05");
    expect(firstDue(WEEKDAYS, TK)).toBe("2026-10-05");
    expect(lastDue(MON_THU, "2026-10-07")).toBe("2026-10-05");
    expect(lastDue(DAILY, TK)).toBe(TK);
  });
});

describe("cleanRepeat", () => {
  it("keeps valid rules and sorts weekdays from Monday", () => {
    expect(cleanRepeat({ every: "week", days: [0, 4, 1, 4] })).toEqual({ every: "week", days: [1, 4, 0] });
    expect(cleanRepeat({ every: "month", date: 12 })).toEqual({ every: "month", date: 12 });
  });
  it.each([null, "daily", {}, { every: "week", days: [] }, { every: "week", days: [9] }, { every: "month", date: 0 }, { every: "year" }])("rejects %j", (r) => {
    expect(cleanRepeat(r)).toBeNull();
  });
});

describe("repeatText", () => {
  it("says how a task repeats, long and short", () => {
    expect(repeatText(WEEKDAYS)).toBe("Every weekday");
    expect(repeatText(MON_THU)).toBe("Every Mon, Thu");
    expect(repeatText({ every: "month", date: 22 })).toBe("Every month on the 22nd");
    expect(repeatText({ every: "month", date: 11 })).toBe("Every month on the 11th");
    expect(repeatShort(DAILY)).toBe("Daily");
    expect(repeatShort(MON_THU)).toBe("Mon, Thu");
    expect(repeatShort({ every: "week", days: [3] })).toBe("Wednesdays");
  });
});

const task = (o: Partial<Task>): Task => ({ id: "a", title: "Water plants", est: 1, sessions: [], ...o });

describe("nextOccurrence", () => {
  it("plans the next copy on the next due day after today, without the finished one's progress", () => {
    const done = task({ id: "s1", repeat: MON_THU, plan: "2026-10-01", done: true, project: "Home", subtasks: [{ id: "x", title: "Fern", done: true }], sessions: [{ at: 1, ms: 5 }] });
    expect(nextOccurrence(done, TK, NOW)).toEqual({
      id: "s1-20261005", title: "Water plants", est: 1, done: false, doneAt: null, createdAt: NOW, plan: "2026-10-05", repeat: MON_THU, series: "s1",
      sessions: [], subtasks: [{ id: "x", title: "Fern", done: false }], project: "Home",
    });
  });
  it("counts from the task's own day when it was finished early", () => {
    expect(nextOccurrence(task({ series: "s1", repeat: DAILY, plan: "2026-10-06" }), TK, NOW)?.plan).toBe("2026-10-07");
  });
  it("gives the same id on two devices, so sync keeps one copy", () => {
    const t = task({ id: "s1", repeat: DAILY, plan: TK });
    expect(nextOccurrence(t, TK, 1)?.id).toBe(nextOccurrence(t, TK, 2)?.id);
  });
  it("returns null without a valid rule", () => {
    expect(nextOccurrence(task({}), TK)).toBeNull();
  });
});

describe("catchUp", () => {
  it("moves a missed occurrence to its latest due day instead of adding another", () => {
    const { save, drop } = catchUp([task({ id: "d", repeat: DAILY, plan: "2026-09-30" }), task({ id: "w", repeat: MON_THU, plan: "2026-09-28" })], TK);
    expect(save.map((t) => [t.id, t.plan])).toEqual([["d", TK], ["w", "2026-10-01"]]);
    expect(drop).toEqual([]);
  });
  it("leaves current, finished and plain tasks alone", () => {
    const { save } = catchUp([task({ repeat: MON_THU, plan: "2026-10-01" }), task({ id: "b", repeat: DAILY, plan: "2026-10-01", done: true }), task({ id: "c", plan: "2026-10-01" })], TK);
    expect(save).toEqual([]);
  });
  it("keeps one open occurrence per series, dropping extras without sessions", () => {
    const { drop } = catchUp([
      task({ id: "s", repeat: DAILY, plan: "2026-10-02" }), task({ id: "s-20261004", series: "s", repeat: DAILY, plan: "2026-10-04" }),
      task({ id: "s-old", series: "s", repeat: DAILY, plan: "2026-10-01", sessions: [{ at: 1 }] }),
    ], TK);
    expect(drop).toEqual(["s"]);
  });
});

describe("withRepeat", () => {
  it("plans the task on the rule's first due day from today", () => {
    expect(withRepeat(task({ today: true, plan: TK }), WEEKDAYS, TK)).toMatchObject({ repeat: WEEKDAYS, today: false, plan: "2026-10-05" });
    expect(withRepeat(task({}), DAILY, TK)).toMatchObject({ today: true, plan: TK });
    expect(withRepeat(task({ plan: "2026-10-08" }), MON_THU, TK)).toMatchObject({ plan: "2026-10-08" });
  });
  it("clears the rule and keeps the day", () => {
    const t = withRepeat(task({ repeat: DAILY, plan: "2026-10-05" }), null, TK);
    expect(t.repeat).toBeUndefined();
    expect(t.plan).toBe("2026-10-05");
  });
});
