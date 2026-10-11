import { describe, expect, it } from "vitest";
import { addDays } from "./dates";
import type { BreakEntry } from "./day";
import { journal, labelPace, lengthBins, ratioWords, sessionKind, shareShift, timerHabits, usualHours, weekLabels } from "./patterns";
import type { Session, Task, Tasks } from "./tasks";

// Saturday, 3 October 2026; the week started on Monday 28 September.
const NOW = new Date(2026, 9, 3, 15, 30).getTime();
const MON = new Date(2026, 8, 28).getTime();
const MIN = 60000, HOUR = 60 * MIN;
const tasks = (...list: Task[]): Tasks => new Map(list.map((t) => [t.id, t]));
/** A session of `min` minutes ending at `hour`:`m` on the day `day` days after `from`. */
const ses = (from: number, day: number, hour: number, m = 0, min = 25, extra: Partial<Session> = {}): Session => ({ at: addDays(from, day) + hour * HOUR + m * MIN, ms: min * MIN, full: min === 25, ...extra });

describe("sessionKind", () => {
  it("tells cycles, flow, time past the bell and stopped cycles apart", () => {
    expect(sessionKind({ at: 0, ms: 25 * MIN, full: true })).toBe("cycle");
    expect(sessionKind({ at: 0, ms: 50 * MIN, run: "fl-abc" })).toBe("flow");
    expect(sessionKind({ at: 0, ms: 8 * MIN, run: "ot-abc" })).toBe("over");
    expect(sessionKind({ at: 0, ms: 12 * MIN, run: "abc" })).toBe("early");
  });
});

describe("ratioWords", () => {
  it("says the ratio plainly", () => {
    expect(ratioWords(0.8)).toBe("less time than you plan");
    expect(ratioWords(1)).toBe("about what you plan");
    expect(ratioWords(1.3)).toBe("about a third longer than you plan");
    expect(ratioWords(1.5)).toBe("about half again as long as you plan");
    expect(ratioWords(2)).toBe("about twice as long as you plan");
    expect(ratioWords(3.4)).toBe("3 times as long as you plan");
  });
});

describe("labelPace", () => {
  const done = (id: string, project: string, est: number, took: number): Task => ({ id, title: id, project, est, done: true, sessions: [...Array(took)].map((_, i) => ses(MON, 0, 9 + i)) });
  it("takes the median per label and needs two tasks", () => {
    const p = labelPace([done("a", "Writing", 4, 8), done("b", "Writing", 2, 3), done("c", "Writing", 5, 10), done("d", "App", 3, 3)]);
    expect(p.get("Writing")).toBe(2);
    expect(p.has("App")).toBe(false);
  });
  it("skips open tasks and tasks without an estimate", () => {
    const p = labelPace([done("a", "App", 0, 4), { ...done("b", "App", 2, 2), done: false }, done("c", "App", 2, 2)]);
    expect(p.size).toBe(0);
  });
});

describe("usualHours", () => {
  const day = (d: number, from: number, to: number, done = true) => ({ from: addDays(MON, d) + from * HOUR, to: addDays(MON, d) + to * HOUR, done });
  it("finds the median start and end", () => {
    expect(usualHours([day(0, 9, 17), day(1, 10, 18), day(2, 8.5, 16), day(3, 9.25, 20, false)])).toEqual({ start: 9.125 * HOUR, end: 17 * HOUR });
  });
  it("needs three days", () => {
    expect(usualHours([day(0, 9, 17), day(1, 10, 18)])).toBeNull();
  });
});

describe("weekLabels and shareShift", () => {
  const t = (id: string, project: string, sessions: Session[]): Task => ({ id, title: id, project, sessions });
  it("adds up each week's focus by label, oldest first", () => {
    const w = weekLabels(tasks(t("a", "App", [ses(MON, 1, 10), ses(MON, -6, 10)]), t("b", "", [ses(MON, 2, 10, 0, 40, { full: false })])), NOW, 3);
    expect(w.map((x) => x.ms / MIN)).toEqual([0, 25, 65]);
    expect(w[2].by.get("")).toBe(40 * MIN);
    expect(w[2].start).toBe(MON);
  });
  it("names the label whose share moved most", () => {
    const old = [...Array(4)].map((_, i) => ses(MON, -21 + i, 10)), recent = [...Array(4)].map((_, i) => ses(MON, i, 10));
    const w = weekLabels(tasks(t("a", "App", [...old, ...recent]), t("b", "Writing", recent)), NOW, 4);
    expect(shareShift(w)).toEqual({ name: "App", from: 1, to: 0.5 });
  });
  it("stays quiet when nothing moved or one half is empty", () => {
    expect(shareShift(weekLabels(tasks(t("a", "App", [ses(MON, -14, 10), ses(MON, 1, 10)])), NOW, 4))).toBeNull();
    expect(shareShift(weekLabels(tasks(t("a", "App", [ses(MON, 1, 10)])), NOW, 4))).toBeNull();
  });
});

describe("timerHabits", () => {
  it("counts breaks, time past the bell, stopped cycles and flow per day", () => {
    const sessions = [ses(MON, 0, 9, 25), ses(MON, 0, 9, 35, 10, { full: false, run: "ot-1" }), ses(MON, 0, 10, 10), ses(MON, 1, 11, 0, 12, { full: false, run: "x" }), ses(MON, 1, 14, 0, 50, { full: false, run: "fl-1" })];
    const breaks: BreakEntry[] = [{ from: MON + 9 * HOUR + 35 * MIN, to: MON + 9 * HOUR + 40 * MIN }];
    const h = timerHabits(tasks({ id: "a", title: "A", project: "Admin", sessions }), breaks, [MON, addDays(MON, 1)]);
    expect(h).toMatchObject({ due: 1, taken: 1, overN: 1, flowN: 1, earlyTop: "Admin" });
    expect(h.over).toEqual([10 * MIN, 0]);
    expect(h.early).toEqual([0, 1]);
    expect(h.flow).toEqual([0, 50 * MIN]);
  });
});

describe("lengthBins", () => {
  it("bins stopped cycles and flow, and counts full cycles apart", () => {
    const b = lengthBins(tasks({ id: "a", title: "A", sessions: [ses(MON, 0, 9), ses(MON, 0, 10, 0, 12, { full: false }), ses(MON, 0, 11, 0, 48, { full: false, run: "fl-1" }), ses(MON, 0, 12, 0, 120, { full: false, run: "fl-2" }), ses(MON, 0, 13, 0, 9, { full: false, run: "ot-1" })] }));
    expect(b.cycles).toBe(1);
    expect(b.bins[2]).toBe(1);
    expect(b.bins[9]).toBe(1);
    expect(b.bins[15]).toBe(1);
    expect(b.early).toEqual([12 * MIN]);
    expect(b.flow).toHaveLength(2);
  });
});

describe("journal", () => {
  it("groups each day's sessions by task, most time first, newest day first", () => {
    const a: Task = { id: "a", title: "Write", project: "Writing", sessions: [ses(MON, 0, 9), ses(MON, 1, 9), ses(MON, 1, 10, 0, 25, { project: "" })] };
    const b: Task = { id: "u", title: "Unplanned focus", system: true, sessions: [ses(MON, 1, 11, 0, 60, { full: false })] };
    const j = journal(tasks(a, b));
    expect(j.map((d) => d.day)).toEqual([addDays(MON, 1), MON]);
    expect(j[0].tasks.map((t) => [t.title, t.ms / MIN])).toEqual([["Unplanned focus", 60], ["Write", 50]]);
    expect(j[0].tasks[1].sessions.map((s) => s.key)).toEqual(["a:1", "a:2"]);
    expect(j[0]).toMatchObject({ ms: 110 * MIN, from: addDays(MON, 1) + 9 * HOUR - 25 * MIN, to: addDays(MON, 1) + 11 * HOUR });
  });
  it("keeps only sessions under the picked label", () => {
    const a: Task = { id: "a", title: "Write", project: "Writing", sessions: [ses(MON, 1, 9), ses(MON, 1, 10, 0, 25, { project: "" })] };
    expect(journal(tasks(a), "project:Writing")[0].tasks[0].sessions.map((s) => s.key)).toEqual(["a:0"]);
    expect(journal(tasks(a), "none")[0].tasks[0].label).toBe("");
  });
});
