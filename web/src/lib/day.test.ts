import { describe, expect, it } from "vitest";
import { breaksTaken, dayGaps, dayItems, daySummary, logBreak, runStart, type DayItem } from "./day";
import type { Session, Task } from "./tasks";

const DAY = new Date(2026, 9, 10).getTime(), MIN = 60000, HOUR = 60 * MIN;
const at = (h: number, m = 0) => DAY + h * HOUR + m * MIN;
const runAt = (t: number) => t.toString(36) + "abc123";
const cycle = (h: number, m: number, o: Partial<Session> = {}): Session => ({ at: at(h, m) + 25 * MIN, ms: 25 * MIN, full: true, run: runAt(at(h, m)), ...o });
const task = (id: string, sessions: Session[], o: Partial<Task> = {}): Task => ({ id, title: id, sessions, ...o });

describe("runStart", () => {
  it("reads the start from a run id, so pauses show", () => {
    expect(runStart(runAt(at(9)), at(9, 40), 25 * MIN)).toBe(at(9));
    expect(runStart("ot-" + at(9, 25).toString(36), at(9, 37), 12 * MIN)).toBe(at(9, 25));
    expect(runStart("fl-" + at(14).toString(36), at(15), HOUR)).toBe(at(14));
  });
  it("falls back to the end minus the length", () => {
    expect(runStart(undefined, at(10), 25 * MIN)).toBe(at(9, 35));
    expect(runStart("zzzzzzzz", at(10), 25 * MIN)).toBe(at(9, 35));
    expect(runStart(runAt(at(9, 50)), at(10), 25 * MIN)).toBe(at(9, 35));
  });
});

describe("logBreak", () => {
  it("adds a break once and keeps a month", () => {
    const old = { from: DAY - 40 * 24 * HOUR, to: DAY - 40 * 24 * HOUR + 5 * MIN };
    const b = { from: at(9, 25), to: at(9, 30) };
    expect(logBreak([old, b], b, at(12))).toEqual([b]);
    expect(logBreak(undefined, b, at(12))).toEqual([b]);
  });
});

describe("dayItems", () => {
  const tasks = [
    task("Write", [cycle(9, 0), cycle(9, 30, { full: false, ms: 10 * MIN, at: at(9, 40) }), cycle(8, 0, { at: at(-20) })], { project: "Docs" }),
    task("unplanned-2026-10", [cycle(13, 0)], { system: true }),
  ];
  const breaks = [{ from: at(9, 25), to: at(9, 31), nudge: "Rest your eyes" }, { from: at(-3), to: at(-2) }];

  it("collects the day's focus and breaks in order, trimming overlaps", () => {
    const items = dayItems(tasks, breaks, at(12));
    expect(items.map((i) => [i.kind, i.from, i.to])).toEqual([
      ["focus", at(9), at(9, 25)], ["break", at(9, 25), at(9, 31)], ["focus", at(9, 31), at(9, 40)], ["focus", at(13), at(13, 25)],
    ]);
    expect(items[0]).toMatchObject({ title: "Write", label: "Docs", full: true });
    expect(items[3]).toMatchObject({ title: "Unplanned focus", label: "" });
    expect(items[1]).toMatchObject({ nudge: "Rest your eyes", long: false });
  });

  it("adds what's running now, counting it once it's logged", () => {
    const live = [{ kind: "break" as const, from: at(13, 25), to: at(13, 28), long: false, live: true }];
    const items = dayItems(tasks, breaks, at(12), live);
    expect(items.at(-1)).toMatchObject({ kind: "break", live: true });
    expect(daySummary(items)).toMatchObject({ breaks: 1, rest: 6 * MIN, end: at(13, 28) });
  });

  it("sums the day", () => {
    expect(daySummary(dayItems(tasks, breaks, at(12)))).toMatchObject({ focus: 60 * MIN, cycles: 2, breaks: 1, rest: 6 * MIN, long: 0, nudges: 1, idle: 3 * HOUR + 20 * MIN, start: at(9), end: at(13, 25), due: 1, taken: 1 });
  });
});

describe("dayGaps", () => {
  it("finds the time between things, skipping touching ones", () => {
    const items = dayItems([task("a", [cycle(9, 0), cycle(9, 30), cycle(12, 0)])], [{ from: at(9, 25), to: at(9, 30) }], at(9));
    expect(dayGaps(items)).toEqual([{ from: at(9, 55), to: at(12) }]);
  });
  it("leaves out the minute it takes to start the next thing", () => {
    const items = dayItems([task("a", [cycle(9, 0), cycle(9, 31)])], [{ from: at(9, 25), to: at(9, 30) }], at(9));
    expect(dayGaps(items)).toEqual([]);
  });
});

describe("breaksTaken", () => {
  const f = (h: number, m: number, len: number, o: object = {}): DayItem => ({ kind: "focus", from: at(h, m), to: at(h, m + len), ms: len * MIN, title: "", label: "", full: true, ...o });
  const b = (h: number, m: number, len: number): DayItem => ({ kind: "break", from: at(h, m), to: at(h, m + len), long: false });

  it("counts a break after each finished cycle, and a skipped one when focus follows", () => {
    expect(breaksTaken([f(9, 0, 25), b(9, 25, 5), f(9, 30, 25), f(9, 55, 25), b(10, 20, 5)])).toEqual({ due: 3, taken: 2 });
  });
  it("lets time past the bell carry the cycle's break", () => {
    expect(breaksTaken([f(9, 0, 25), f(9, 25, 10, { full: false, over: true }), b(9, 35, 7)])).toEqual({ due: 1, taken: 1 });
  });
  it("ignores the day's last cycle, stopped sessions and a break that came after idle time", () => {
    expect(breaksTaken([f(9, 0, 10, { full: false }), b(9, 10, 5), f(9, 30, 25), b(10, 20, 5), f(10, 25, 25)])).toEqual({ due: 1, taken: 0 });
  });
  it("counts flow like a cycle", () => {
    expect(breaksTaken([f(9, 0, 50, { full: false, flow: true }), b(9, 50, 10)])).toEqual({ due: 1, taken: 1 });
  });
});
