import { describe, expect, it } from "vitest";
import { addDays } from "./dates";
import { decimalComma, rangeOf, sessionCycles, sessionStart, sheetFileName, sheetRows, timesheet, toCSV, toTSV } from "./timesheet";
import type { Session, Task, Tasks } from "./tasks";

// Saturday, 3 October 2026; the week started on Monday 28 September.
const NOW = new Date(2026, 9, 3, 15, 30).getTime();
const MON = new Date(2026, 8, 28).getTime();
const MIN = 60000, HOUR = 60 * MIN;
const tasks = (...list: Task[]): Tasks => new Map(list.map((t) => [t.id, t]));
/** A session of `min` minutes ending at `hour`:`m` on the day `day` days after Monday. */
const ses = (day: number, hour: number, m = 0, min = 25, extra: Partial<Session> = {}): Session => ({ at: addDays(MON, day) + hour * HOUR + m * MIN, ms: min * MIN, full: min === 25, ...extra });
const WEEK = { from: "2026-09-28", to: "2026-10-04" };

describe("rangeOf", () => {
  it("covers this and last week from Monday", () => {
    expect(rangeOf("week", NOW)).toEqual(WEEK);
    expect(rangeOf("lastWeek", NOW)).toEqual({ from: "2026-09-21", to: "2026-09-27" });
  });
  it("covers whole months, across a year", () => {
    expect(rangeOf("month", NOW)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(rangeOf("lastMonth", NOW)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(rangeOf("lastMonth", new Date(2026, 0, 15).getTime())).toEqual({ from: "2025-12-01", to: "2025-12-31" });
  });
  it("puts a custom range in order and falls back to today", () => {
    expect(rangeOf("custom", NOW, { from: "2026-10-02", to: "2026-09-01" })).toEqual({ from: "2026-09-01", to: "2026-10-02" });
    expect(rangeOf("custom", NOW, { from: "2026-02-30" })).toEqual({ from: "2026-10-03", to: "2026-10-03" });
    expect(rangeOf("custom", NOW)).toEqual({ from: "2026-10-03", to: "2026-10-03" });
  });
});

describe("sessionCycles and sessionStart", () => {
  it("counts full cycles, and several for a long one added by hand", () => {
    expect(sessionCycles({ at: 0, ms: 25 * MIN, full: true })).toBe(1);
    expect(sessionCycles({ at: 0, ms: 12 * MIN })).toBe(0);
    expect(sessionCycles({ at: 0, ms: 90 * MIN, full: true, cycles: 3.6 } as Session)).toBe(3);
    expect(sessionCycles({ at: 0, ms: 90 * MIN, cycles: 3 } as Session)).toBe(0);
  });
  it("takes a hand-added start as typed and a timer start from its run", () => {
    const at = addDays(MON, 1) + 10 * HOUR, run = (at - 40 * MIN).toString(36);
    expect(sessionStart({ at, ms: 25 * MIN, run })).toBe(at - 40 * MIN);
    expect(sessionStart({ at, ms: 25 * MIN, run, hand: true } as Session)).toBe(at - 25 * MIN);
  });
});

describe("timesheet", () => {
  const all = tasks(
    { id: "a", title: "Draft methods", project: "Writing", sessions: [ses(0, 10), ses(0, 11), ses(2, 9, 0, 40, { run: "fl-x" })] },
    { id: "b", title: "Review script", project: "Code", sessions: [ses(1, 14), ses(1, 15, 0, 25, { project: "Writing" })] },
    { id: "c", title: "Old", project: "Code", sessions: [ses(-1, 10), ses(7, 10)] },
    { id: "s1", title: "x", system: true, sessions: [ses(3, 9, 0, 30)] },
    { id: "s2", title: "y", system: true, sessions: [ses(4, 9, 0, 20)] },
  );

  it("groups by label, biggest first, no label last, tasks by time", () => {
    const s = timesheet(all, WEEK, "", "task");
    expect(s.groups.map((g) => [g.label, g.ms / MIN, g.cycles])).toEqual([["Writing", 115, 3], ["Code", 25, 1], ["", 50, 0]]);
    expect(s.groups[0].rows.map((r) => [r.title, r.ms / MIN])).toEqual([["Draft methods", 90], ["Review script", 25]]);
    expect(s.groups[2].rows).toEqual([{ key: "", title: "Unplanned focus", label: "", ms: 50 * MIN, cycles: 0 }]);
    expect([s.ms / MIN, s.cycles]).toEqual([190, 4]);
  });

  it("groups by day in order, a task once per label each day", () => {
    const s = timesheet(all, WEEK, "", "day");
    expect(s.groups.map((g) => [g.day, g.ms / MIN])).toEqual([["2026-09-28", 50], ["2026-09-29", 50], ["2026-09-30", 40], ["2026-10-01", 30], ["2026-10-02", 20]]);
    expect(s.groups[1].rows.map((r) => [r.title, r.label])).toEqual([["Review script", "Code"], ["Review script", "Writing"]]);
  });

  it("narrows to a label, using each session's own label", () => {
    const s = timesheet(all, WEEK, "project:Writing", "task");
    expect(s.groups.map((g) => g.label)).toEqual(["Writing"]);
    expect(s.ms / MIN).toBe(115);
    expect(timesheet(all, WEEK, "none", "task").ms / MIN).toBe(50);
  });

  it("puts a session on the day it started, across midnight", () => {
    const night = tasks({ id: "n", title: "Late", sessions: [{ at: addDays(MON, 7) + 10 * MIN, ms: 25 * MIN, full: true }] });
    expect(timesheet(night, WEEK, "", "day").groups.map((g) => g.day)).toEqual(["2026-10-04"]);
    expect(timesheet(night, { from: "2026-10-05", to: "2026-10-05" }, "", "day").groups).toEqual([]);
  });

  it("counts hand-added sessions by their typed times and cycles", () => {
    const hand = tasks({ id: "h", title: "Forgot the timer", project: "Code", sessions: [{ at: addDays(MON, 1) + 0.5 * HOUR, ms: 75 * MIN, full: true, hand: true, cycles: 3 } as Session] });
    const s = timesheet(hand, WEEK, "", "day");
    expect(s.groups.map((g) => [g.day, g.cycles])).toEqual([["2026-09-28", 3]]);
  });

  it("is empty without focus in the range", () => {
    expect(timesheet(all, { from: "2026-11-01", to: "2026-11-30" }, "", "task")).toEqual({ groups: [], ms: 0, cycles: 0 });
  });
});

describe("export", () => {
  const sheet = timesheet(tasks(
    { id: "a", title: 'Say "hi", then go', project: "Client A; B", sessions: [ses(0, 10, 0, 105, { full: false })] },
    { id: "b", title: "=SUM(A1)", sessions: [ses(1, 10)] },
  ), WEEK, "", "task");

  it("writes a header and one row per task, hours and minutes agreeing", () => {
    expect(sheetRows(sheet, "task", false)).toEqual([
      ["Label", "Task", "Hours", "Minutes", "Cycles"],
      ["Client A; B", 'Say "hi", then go', "1.75", "105", "0"],
      ["No label", "'=SUM(A1)", "0.42", "25", "1"],
    ]);
    expect(sheetRows(timesheet(tasks({ id: "b", title: "B", sessions: [ses(1, 10)] }), WEEK, "", "day"), "day", true)).toEqual([
      ["Date", "Label", "Task", "Hours", "Minutes", "Cycles"],
      ["2026-09-29", "No label", "B", "0,42", "25", "1"],
    ]);
  });

  it("quotes CSV cells that need it, with semicolons for a decimal comma", () => {
    const rows = sheetRows(sheet, "task", false);
    expect(toCSV(rows, false).split("\r\n")[1]).toBe('Client A; B,"Say ""hi"", then go",1.75,105,0');
    expect(toCSV(sheetRows(sheet, "task", true), true).split("\r\n")[1]).toBe('"Client A; B";"Say ""hi"", then go";1,75;105;0');
    expect(toCSV([["a", " b", "c\nd"]], false)).toBe('a," b","c\nd"\r\n');
  });

  it("keeps TSV cells on one line", () => {
    expect(toTSV([["A", "B"], ["x\ty", "line\nbreak"]])).toBe("A\tB\nx y\tline break\n");
  });

  it("knows decimal-comma locales", () => {
    expect(decimalComma("de-DE")).toBe(true);
    expect(decimalComma("en-US")).toBe(false);
  });

  it("names the file after the label and the days", () => {
    expect(sheetFileName("", WEEK)).toBe("timesheet-all-2026-09-28-2026-10-04.csv");
    expect(sheetFileName("project:Über Client", WEEK)).toBe("timesheet-uber-client-2026-09-28-2026-10-04.csv");
    expect(sheetFileName("none", WEEK)).toBe("timesheet-no-label-2026-09-28-2026-10-04.csv");
  });
});
