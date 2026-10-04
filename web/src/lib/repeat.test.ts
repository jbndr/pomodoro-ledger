import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { anchored, catchUp, cleanRepeat, firstDue, isDue, lastDue, nextDue, nextOccurrence, parseRepeat, repeatShort, repeatText, withRepeat, type Repeat } from "./repeat";
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

const dues = (r: Repeat, from: string, n: number) => {
  const out = [firstDue(r, from)];
  while (out.length < n) out.push(nextDue(r, out.at(-1)!));
  return out;
};

describe("intervals", () => {
  const BI_MON_THU: Repeat = { every: "week", days: [1, 4], n: 2, from: "2026-10-05" };

  it.each([
    ["every 2 days", { every: "day", n: 2, from: TK }], ["every other day", { every: "day", n: 2, from: TK }], ["every 3 days", { every: "day", n: 3, from: TK }],
    ["every three days", { every: "day", n: 3, from: TK }], ["every 1 day", { every: "day" }],
    ["every 2 weeks", { every: "week", days: [6], n: 2, from: TK }], ["every other week", { every: "week", days: [6], n: 2, from: TK }],
    ["every second week", { every: "week", days: [6], n: 2, from: TK }], ["every 2nd week", { every: "week", days: [6], n: 2, from: TK }],
    ["biweekly", { every: "week", days: [6], n: 2, from: TK }], ["fortnightly", { every: "week", days: [6], n: 2, from: TK }],
    ["every 2 weeks on mon", { every: "week", days: [1], n: 2, from: "2026-10-05" }],
    ["every 2 weeks on monday and thursday", { every: "week", days: [1, 4], n: 2, from: "2026-10-05" }],
    ["every 3 weeks mon, wed and fri", { every: "week", days: [1, 3, 5], n: 3, from: "2026-10-05" }],
    ["biweekly on fri", { every: "week", days: [5], n: 2, from: "2026-10-09" }],
    ["every other monday", { every: "week", days: [1], n: 2, from: "2026-10-05" }],
    ["every other sat and sun", { every: "week", days: [6, 0], n: 2, from: TK }],
    ["every 3 months", { every: "month", date: 3, n: 3, from: TK }], ["every other month", { every: "month", date: 3, n: 2, from: TK }],
    ["every 3 months on the 15th", { every: "month", date: 15, n: 3, from: "2026-10-15" }], ["every 6 months on the 1st", { every: "month", date: 1, n: 6, from: "2026-11-01" }],
    ["alle 2 Wochen", { every: "week", days: [6], n: 2, from: TK }], ["alle zwei Wochen am Montag", { every: "week", days: [1], n: 2, from: "2026-10-05" }],
    ["alle 2 wochen montags", { every: "week", days: [1], n: 2, from: "2026-10-05" }], ["jede zweite Woche", { every: "week", days: [6], n: 2, from: TK }],
    ["zweiwöchentlich", { every: "week", days: [6], n: 2, from: TK }], ["jeden zweiten Tag", { every: "day", n: 2, from: TK }],
    ["alle 3 Tage", { every: "day", n: 3, from: TK }], ["jeden 2. Tag", { every: "day", n: 2, from: TK }],
    ["alle 3 Monate am 15.", { every: "month", date: 15, n: 3, from: "2026-10-15" }], ["jeden zweiten Montag", { every: "week", days: [1], n: 2, from: "2026-10-05" }],
  ])("reads %j", (q, expected) => {
    expect(parseRepeat(q, NOW)).toEqual(expected);
  });

  it.each(["every 2", "every 2 weekdays", "every 0 days", "every 2 days on mon", "every 2 weeks on the 15th", "every 3 months on mon", "every 60 weeks", "every 2 mondays", "every second monday", "every other", "every other page", "alle 2"])("rejects %j", (q) => {
    expect(parseRepeat(q, NOW)).toBeUndefined();
  });

  it("counts every other day from its start across a month end and a leap day", () => {
    expect(dues({ every: "day", n: 2, from: "2026-01-29" }, "2026-01-29", 4)).toEqual(["2026-01-29", "2026-01-31", "2026-02-02", "2026-02-04"]);
    expect(dues({ every: "day", n: 2, from: "2028-02-27" }, "2028-02-27", 3)).toEqual(["2028-02-27", "2028-02-29", "2028-03-02"]);
    expect(dues({ every: "day", n: 2, from: "2027-02-27" }, "2027-02-27", 3)).toEqual(["2027-02-27", "2027-03-01", "2027-03-03"]);
    expect(dues({ every: "day", n: 3, from: "2026-12-30" }, "2026-12-30", 3)).toEqual(["2026-12-30", "2027-01-02", "2027-01-05"]);
  });

  it("keeps to the start's cycle when counting from any day", () => {
    const r: Repeat = { every: "day", n: 3, from: "2026-10-01" };
    expect(firstDue(r, "2026-10-02")).toBe("2026-10-04");
    expect(nextDue(r, "2026-10-04")).toBe("2026-10-07");
    expect(lastDue(r, "2026-10-06")).toBe("2026-10-04");
    expect(isDue(r, "2026-09-28")).toBe(true);
    expect(isDue(r, "2026-09-29")).toBe(false);
  });

  it("repeats on the chosen days of every second week only", () => {
    expect(dues(BI_MON_THU, "2026-10-05", 6)).toEqual(["2026-10-05", "2026-10-08", "2026-10-19", "2026-10-22", "2026-11-02", "2026-11-05"]);
    expect(isDue(BI_MON_THU, "2026-10-12")).toBe(false);
    expect(firstDue(BI_MON_THU, "2026-10-09")).toBe("2026-10-19");
    expect(lastDue(BI_MON_THU, "2026-10-18")).toBe("2026-10-08");
  });

  it("counts weeks from Monday, so a Sunday belongs to the week before it", () => {
    expect(dues({ every: "week", days: [1, 0], n: 2, from: "2026-10-05" }, "2026-10-05", 4)).toEqual(["2026-10-05", "2026-10-11", "2026-10-19", "2026-10-25"]);
  });

  it("keeps the same weeks across a year end and a 53-week year", () => {
    expect(dues({ every: "week", days: [1], n: 2, from: "2026-12-21" }, "2026-12-21", 3)).toEqual(["2026-12-21", "2027-01-04", "2027-01-18"]);
    expect(dues({ every: "week", days: [4], n: 3, from: "2026-12-31" }, "2026-12-31", 3)).toEqual(["2026-12-31", "2027-01-21", "2027-02-11"]);
  });

  it("finds weeks a long way from the start in both directions", () => {
    const r: Repeat = { every: "week", days: [3], n: 2, from: "2026-10-07" };
    expect(isDue(r, "2031-10-15")).toBe(true);
    expect(isDue(r, "2031-10-08")).toBe(false);
    expect(isDue(r, "2020-10-14")).toBe(true);
    expect(isDue(r, "2020-10-07")).toBe(false);
  });

  it("moves a day past a short month's end to its last day, every few months", () => {
    expect(dues({ every: "month", date: 31, n: 3, from: "2026-01-31" }, "2026-01-31", 5)).toEqual(["2026-01-31", "2026-04-30", "2026-07-31", "2026-10-31", "2027-01-31"]);
    expect(dues({ every: "month", date: 29, n: 3, from: "2027-11-29" }, "2027-11-29", 2)).toEqual(["2027-11-29", "2028-02-29"]);
    expect(dues({ every: "month", date: 29, n: 3, from: "2026-11-29" }, "2026-11-29", 2)).toEqual(["2026-11-29", "2027-02-28"]);
    expect(dues({ every: "month", date: 29, n: 12, from: "2028-02-29" }, "2028-02-29", 5)).toEqual(["2028-02-29", "2029-02-28", "2030-02-28", "2031-02-28", "2032-02-29"]);
    expect(nextDue({ every: "month", date: 15, n: 24, from: "2026-10-15" }, "2026-10-15")).toBe("2028-10-15");
  });

  it("starts an interval on the rule's first due day", () => {
    expect(anchored({ every: "week", days: [1, 4], n: 2 }, "2026-10-06")).toEqual({ every: "week", days: [1, 4], n: 2, from: "2026-10-08" });
    expect(anchored({ every: "month", date: 1, n: 3 }, TK)).toEqual({ every: "month", date: 1, n: 3, from: "2026-11-01" });
    expect(anchored(BI_MON_THU, "2027-01-01")).toBe(BI_MON_THU);
    expect(anchored(MON_THU, TK)).toBe(MON_THU);
  });

  it("cleans interval rules and keeps old rules as they were", () => {
    expect(cleanRepeat({ every: "week", days: [4, 1], n: 2, from: "2026-10-05" })).toEqual(BI_MON_THU);
    expect(cleanRepeat({ every: "day", n: 1, from: TK })).toEqual({ every: "day" });
    expect(cleanRepeat({ every: "weekday", n: 2, from: TK })).toEqual({ every: "weekday" });
    expect(cleanRepeat({ every: "week", days: [1], n: 53, from: TK })).toEqual({ every: "week", days: [1] });
    expect(cleanRepeat({ every: "day", n: 2.5 })).toEqual({ every: "day" });
    expect(cleanRepeat({ every: "day", n: 2, from: "2026-02-30" })).toEqual({ every: "day", n: 2 });
    expect(cleanRepeat({ every: "month", date: 15, n: 24, from: TK })).toEqual({ every: "month", date: 15, n: 24, from: TK });
  });

  it("uses a fixed cycle for a rule saved without a start, so devices agree", () => {
    expect(nextDue({ every: "week", days: [1], n: 2 }, "2000-01-03")).toBe("2000-01-17");
    expect(isDue({ every: "day", n: 2 }, "2000-01-05")).toBe(true);
  });

  it("says how an interval repeats", () => {
    expect(repeatText({ every: "day", n: 2, from: TK })).toBe("Every other day");
    expect(repeatText({ every: "day", n: 3, from: TK })).toBe("Every 3 days");
    expect(repeatText(BI_MON_THU)).toBe("Every 2 weeks · Mon, Thu");
    expect(repeatText({ every: "month", date: 15, n: 3, from: TK })).toBe("Every 3 months on the 15th");
    expect(repeatShort({ every: "day", n: 3, from: TK })).toBe("Every 3 days");
    expect(repeatShort(BI_MON_THU)).toBe("Every 2 wks · Mon, Thu");
    expect(repeatShort({ every: "month", date: 15, n: 3, from: TK })).toBe("Every 3 months");
  });

  it("plans the next copy on the right week after a missed one, with the same id on every device", () => {
    const t = task({ id: "s1", repeat: BI_MON_THU, plan: "2026-10-08", done: true });
    expect(nextOccurrence(t, "2026-10-08", 1)).toMatchObject({ id: "s1-20261019", plan: "2026-10-19", repeat: BI_MON_THU });
    expect(nextOccurrence(t, "2026-10-14", 1)?.id).toBe("s1-20261019");
    expect(nextOccurrence(t, "2026-10-20", 1)?.plan).toBe("2026-10-22");
    expect(nextOccurrence(t, "2026-10-23", 1)?.plan).toBe("2026-11-02");
    expect(nextOccurrence(t, "2026-10-23", 1)?.id).toBe(nextOccurrence(t, "2026-10-23", 2)?.id);
  });

  it("moves a missed interval occurrence to its latest due day on the cycle", () => {
    const { save } = catchUp([
      task({ id: "w", repeat: BI_MON_THU, plan: "2026-10-05" }),
      task({ id: "d", repeat: { every: "day", n: 3, from: "2026-10-01" }, plan: "2026-10-01" }),
      task({ id: "m", repeat: { every: "month", date: 31, n: 2, from: "2026-08-31" }, plan: "2026-08-31" }),
    ], "2026-10-31");
    expect(save.map((t) => [t.id, t.plan])).toEqual([["w", "2026-10-22"], ["d", "2026-10-31"], ["m", "2026-10-31"]]);
    expect(catchUp([task({ id: "w", repeat: BI_MON_THU, plan: "2026-10-08" })], "2026-10-18").save).toEqual([]);
  });

  it("anchors a new interval at the task's own later day", () => {
    const t = withRepeat(task({ plan: "2026-10-13" }), { every: "week", days: [1, 4], n: 2 }, TK);
    expect(t).toMatchObject({ plan: "2026-10-15", repeat: { every: "week", days: [1, 4], n: 2, from: "2026-10-15" } });
    expect(withRepeat(task({}), { every: "day", n: 2 }, TK)).toMatchObject({ plan: TK, today: true, repeat: { from: TK } });
    expect(withRepeat(task({}), BI_MON_THU, TK).plan).toBe("2026-10-05");
  });
});

describe.each([["Europe/Berlin", -60], ["America/New_York", 300], ["Australia/Lord_Howe", -660], ["America/Sao_Paulo", 180], ["UTC", 0]])("in %s", (tz, january) => {
  beforeAll(() => { vi.stubEnv("TZ", tz as string); });
  afterAll(() => { vi.unstubAllEnvs(); });

  it("runs in that time zone", () => {
    expect(new Date(2026, 0, 1).getTimezoneOffset()).toBe(january);
  });

  it("counts days and weeks the same across daylight saving changes", () => {
    expect(dues({ every: "day", n: 2, from: "2026-03-27" }, "2026-03-27", 4)).toEqual(["2026-03-27", "2026-03-29", "2026-03-31", "2026-04-02"]);
    expect(dues({ every: "day", n: 2, from: "2026-03-07" }, "2026-03-07", 3)).toEqual(["2026-03-07", "2026-03-09", "2026-03-11"]);
    expect(dues({ every: "day", n: 3, from: "2026-10-24" }, "2026-10-24", 4)).toEqual(["2026-10-24", "2026-10-27", "2026-10-30", "2026-11-02"]);
    expect(dues({ every: "week", days: [0, 1], n: 2, from: "2026-10-19" }, "2026-10-19", 4)).toEqual(["2026-10-19", "2026-10-25", "2026-11-02", "2026-11-08"]);
    expect(dues({ every: "week", days: [0], n: 2, from: "2026-03-08" }, "2026-03-08", 3)).toEqual(["2026-03-08", "2026-03-22", "2026-04-05"]);
    expect(lastDue({ every: "day", n: 2, from: "2026-03-27" }, "2026-04-01")).toBe("2026-03-31");
  });

  it("reads intervals and plans copies on the right local days", () => {
    const at = new Date(2026, 2, 28, 23, 30).getTime();
    expect(parseRepeat("every 2 weeks on sun", at)).toEqual({ every: "week", days: [0], n: 2, from: "2026-03-29" });
    const t = task({ id: "s", repeat: { every: "day", n: 2, from: "2026-10-24" }, plan: "2026-10-24", done: true });
    expect(nextOccurrence(t, "2026-10-24", 1)?.id).toBe("s-20261026");
  });
});
