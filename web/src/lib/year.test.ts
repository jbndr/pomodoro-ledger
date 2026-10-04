import { describe, expect, it } from "vitest";
import { addDays, dayKey } from "./dates";
import type { Session, Task, Tasks } from "./tasks";
import { badges, focusYears, longestRun, monthsSoFar, personaOf, yearDue, yearStats } from "./year";

// Sunday, 4 October 2026.
const NOW = new Date(2026, 9, 4, 15, 30).getTime();
const JAN = new Date(2026, 0, 1).getTime();
const MIN = 60000, HOUR = 60 * MIN;
const tasks = (...list: Task[]): Tasks => new Map(list.map((t) => [t.id, t]));
/** A full cycle ending at `hour`:`min` on the day `day` days after New Year. */
const cycle = (day: number, hour = 10, min = 0, extra: Partial<Session> = {}): Session => ({ at: addDays(JAN, day) + hour * HOUR + min * MIN, ms: 25 * MIN, full: true, ...extra });
const days = (from: number, n: number, hour = 10) => [...Array(n)].map((_, i) => cycle(from + i, hour));

describe("yearStats", () => {
  const y = yearStats(tasks(
    { id: "a", title: "A", project: "Website", sessions: [...days(10, 5), cycle(40, 9), cycle(40, 10), cycle(40, 11), { at: addDays(JAN, 41) + 10 * HOUR, ms: 12 * MIN }] },
    { id: "b", title: "B", done: true, doneAt: addDays(JAN, 60), sessions: [cycle(60, 22, 30), cycle(-3)] },
    { id: "c", title: "C", project: "App", sessions: [cycle(100, 7, 10, { project: "" }), cycle(101, 15)] },
  ), 2026, NOW);

  it("adds up only this year's focus", () => {
    expect(y).toMatchObject({ year: 2026, partial: true, end: NOW, cycles: 11, sessions: 12, active: 10, finished: 1 });
    expect(y.ms).toBe(11 * 25 * MIN + 12 * MIN);
  });
  it("ranks labels by focus, skipping unlabeled sessions", () => {
    expect(y.labels).toEqual([{ name: "Website", ms: 8 * 25 * MIN + 12 * MIN, cycles: 8 }, { name: "App", ms: 25 * MIN, cycles: 1 }]);
  });
  it("finds the best month and busiest day", () => {
    expect(y.bestMonth).toBe(0);
    expect(y.busiest).toMatchObject({ t: addDays(JAN, 40), cycles: 3, ms: 75 * MIN });
    expect(y.busiest!.blocks).toHaveLength(3);
    expect(y.busiest!.blocks[0]).toEqual({ from: addDays(JAN, 40) + 9 * HOUR - 25 * MIN, to: addDays(JAN, 40) + 9 * HOUR });
  });
  it("finds the longest streak and the longest break", () => {
    expect(y.streak).toEqual({ days: 5, from: addDays(JAN, 10), to: addDays(JAN, 14) });
    expect(y.gap).toEqual({ days: 39, back: addDays(JAN, 100) });
  });
  it("counts early and late cycles by when they started", () => {
    expect(y.early).toBe(1);
    expect(y.late).toBe(1);
  });
  it("is not partial for a past year", () => {
    expect(yearStats(new Map(), 2025, NOW)).toMatchObject({ partial: false, end: JAN, active: 0, bestMonth: null, busiest: null, streak: null, gap: null, persona: null });
  });
});

describe("longestRun", () => {
  it("prefers the first of two equal runs", () => {
    const m = new Map([0, 1, 5, 6].map((d) => [dayKey(addDays(JAN, d)), { ms: 1, cycles: 1 }]));
    expect(longestRun(m, JAN, addDays(JAN, 10))).toEqual({ days: 2, from: JAN, to: addDays(JAN, 1) });
  });
  it("ignores days with only partial sessions", () => {
    const m = new Map([[dayKey(JAN), { ms: 9 * MIN, cycles: 0 }]]);
    expect(longestRun(m, JAN, addDays(JAN, 3))).toBeNull();
  });
});

describe("personaOf", () => {
  const at = (...hs: number[]) => { const a = Array<number>(24).fill(0); hs.forEach((h) => (a[h] += 1)); return a; };
  it("names the part of the day with the most focus", () => {
    expect(personaOf(at(9, 10, 15))).toBe("morning");
    expect(personaOf(at(13, 14, 9))).toBe("afternoon");
    expect(personaOf(at(18, 19, 9))).toBe("evening");
    expect(personaOf(at(23, 1, 9))).toBe("night");
    expect(personaOf(at())).toBeNull();
  });
});

describe("focusYears", () => {
  it("lists years with focus, oldest first", () => {
    expect(focusYears(tasks({ id: "a", title: "A", sessions: [cycle(3), cycle(-40), { at: addDays(JAN, -800), ms: 0 }] }))).toEqual([2025, 2026]);
  });
});

describe("badges", () => {
  const ids = (list: ReturnType<typeof badges>) => list.filter((b) => b.earned).map((b) => b.id);

  it("earns nothing for an empty year, with progress at zero", () => {
    const list = badges(yearStats(new Map(), 2026, NOW));
    expect(list).toHaveLength(12);
    expect(ids(list)).toEqual([]);
    expect(list.every((b) => b.have === 0)).toBe(true);
  });
  it("earns streaks, marathons and early starts", () => {
    const y = yearStats(tasks({ id: "a", title: "A", sessions: [...days(0, 10, 7), ...[...Array(10)].map((_, i) => cycle(20, 9 + i))] }), 2026, NOW);
    const list = badges(y, 8);
    expect(ids(list)).toEqual(["week", "marathon", "early"]);
    expect(list.find((b) => b.id === "century")).toMatchObject({ have: 20, need: 100 });
    expect(list.find((b) => b.id === "goal")).toMatchObject({ have: 1, need: 10 });
  });
  it("names the label behind Label loyalist", () => {
    const y = yearStats(tasks({ id: "a", title: "A", project: "Thesis", sessions: [...Array(50)].map((_, i) => cycle(i % 20, 9 + Math.floor(i / 20))) }), 2026, NOW);
    expect(badges(y).find((b) => b.id === "loyal")).toMatchObject({ earned: true, note: "Thesis" });
  });
  it("counts a comeback after two weeks away", () => {
    const y = yearStats(tasks({ id: "a", title: "A", sessions: [cycle(0), cycle(15), cycle(16)] }), 2026, NOW);
    expect(ids(badges(y))).toContain("comeback");
    expect(ids(badges(yearStats(tasks({ id: "a", title: "A", sessions: [cycle(0), cycle(14)] }), 2026, NOW)))).not.toContain("comeback");
  });
  it("asks for every month that has passed", () => {
    const y = yearStats(tasks({ id: "a", title: "A", sessions: [...Array(10)].map((_, m) => ({ at: new Date(2026, m, 3, 10).getTime(), ms: 25 * MIN, full: true })) }), 2026, NOW);
    expect(monthsSoFar(y)).toBe(10);
    expect(badges(y).find((b) => b.id === "allYear")).toMatchObject({ earned: true, have: 10, need: 10 });
  });
});

describe("yearDue", () => {
  const t = tasks({ id: "a", title: "A", sessions: [cycle(3)] });
  const DEC = new Date(2026, 11, 2, 10).getTime();
  it("offers the year once, in December, when it had focus", () => {
    expect(yearDue(t, DEC, undefined)).toBe(2026);
    expect(yearDue(t, DEC, 2026)).toBeNull();
    expect(yearDue(t, NOW, undefined)).toBeNull();
    expect(yearDue(new Map(), DEC, undefined)).toBeNull();
  });
});
