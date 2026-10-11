import { describe, expect, it } from "vitest";
import { expectedCycles, learnPace, paceFor, paceText, sessionCycles, tookOf } from "./pace";
import type { Session, Task } from "./tasks";

const MIN = 60000, FOCUS = 25 * MIN;
const NOW = new Date(2026, 9, 12, 15, 0).getTime();
const cycle = (extra: Partial<Session> = {}): Session => ({ at: NOW - 864e5, ms: FOCUS, full: true, ...extra });
let n = 0;
const task = (est: number, sessions: Session[], extra: Partial<Task> = {}): Task => ({ id: "t" + n++, title: "T", est, done: true, doneAt: NOW - 864e5, sessions, ...extra });
const took = (k: number) => [...Array(k)].map(() => cycle());

describe("sessionCycles", () => {
  it("counts a logged cycle as one, whatever its length", () => {
    expect(sessionCycles(cycle({ ms: 50 * MIN }), FOCUS)).toBe(1);
  });
  it("counts a cycle entered by hand as the cycles it says", () => {
    expect(sessionCycles(cycle({ ms: 75 * MIN, hand: true, cycles: 3 }), FOCUS)).toBe(3);
    expect(sessionCycles({ at: NOW, ms: 20 * MIN, hand: true }, FOCUS)).toBeCloseTo(0.8);
  });
  it("counts flow, time past the bell and stopped cycles by their length", () => {
    expect(sessionCycles({ at: NOW, ms: 50 * MIN, run: "fl-abc" }, FOCUS)).toBe(2);
    expect(sessionCycles({ at: NOW, ms: 10 * MIN }, FOCUS)).toBeCloseTo(0.4);
  });
  it("adds up a task", () => {
    expect(tookOf(task(2, [cycle(), { at: NOW, ms: 50 * MIN }]), FOCUS)).toBe(3);
  });
});

describe("learnPace", () => {
  it("needs a few finished tasks before it says anything", () => {
    expect(learnPace([task(2, took(4)), task(2, took(4))], FOCUS, NOW).all).toBeNull();
  });
  it("compares what tasks took with their estimates, pulled toward 1 by a few cycles", () => {
    const p = learnPace([task(2, took(4)), task(2, took(4)), task(2, took(4)), task(2, took(4))], FOCUS, NOW);
    expect(p.all!.ratio).toBeCloseTo((16 + 4) / (8 + 4));
    expect(p.all!.n).toBe(4);
  });
  it("skips unfinished, unestimated, untimed, unplanned-focus and old tasks", () => {
    const p = learnPace([
      task(2, took(2)), task(2, took(2)), task(2, took(2)),
      task(2, took(9), { done: false }), task(0, took(9)), task(3, []), task(2, took(9), { system: true }),
      task(2, took(9), { doneAt: NOW - 200 * 864e5 }),
    ], FOCUS, NOW);
    expect(p.all!.ratio).toBe(1);
    expect(p.all!.n).toBe(3);
  });
  it("caps a task that ran far past its estimate, so one forgotten tick can't swing it", () => {
    const p = learnPace([task(1, took(40)), task(2, took(2)), task(2, took(2))], FOCUS, NOW);
    expect(p.all!.ratio).toBeCloseTo((4 + 4 + 4) / (5 + 4));
  });
  it("learns each label, pulled toward your overall pace", () => {
    const w = (est: number, k: number) => task(est, took(k), { project: "Writing" }), c = (k: number) => task(2, took(k), { project: "Code" });
    const p = learnPace([w(2, 4), w(2, 4), w(2, 4), c(2), c(2)], FOCUS, NOW);
    const all = (16 + 4) / (10 + 4);
    expect(p.all!.ratio).toBeCloseTo(all);
    expect(p.labels.get("Writing")!.ratio).toBeCloseTo((12 + 4 * all) / (6 + 4));
    expect(p.labels.has("Code")).toBe(false);
    expect(paceFor(p, "Code")).toBe(p.all);
    expect(paceFor(p, "")).toBe(p.all);
  });
  it("keeps the ratio in a sane range", () => {
    const p = learnPace([...Array(10)].map(() => task(1, took(4))), FOCUS, NOW);
    expect(p.all!.ratio).toBe(3);
  });
});

describe("expectedCycles", () => {
  it("rounds the estimate at your pace, never below one cycle", () => {
    expect(expectedCycles(3, 1.6)).toBe(5);
    expect(expectedCycles(1, 0.6)).toBe(1);
    expect(expectedCycles(0, 2)).toBe(0);
  });
});

describe("paceText", () => {
  it("drops a trailing .0", () => {
    expect(paceText(1.6)).toBe("1.6×");
    expect(paceText(1.02)).toBe("1×");
  });
});
