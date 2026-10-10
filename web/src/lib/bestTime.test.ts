import { describe, expect, it } from "vitest";
import { addDays } from "./dates";
import { bestSlot, inWindow, overlap, planWindow, windowOn } from "./bestTime";
import type { FocusWindow } from "./insights";
import type { Session, Task } from "./tasks";

const MIN = 60000, HOUR = 60 * MIN;
// Saturday 10 October 2026, and the Monday before it.
const SAT = new Date(2026, 9, 10).getTime(), MON = new Date(2026, 9, 5).getTime();
const at = (day: number, h: number, m = 0) => new Date(day).setHours(h, m);
const win = (from: number, to: number, days: FocusWindow["days"] = null): FocusWindow => ({ from, to, days, share: 0.6, text: "" });
const span = (start: number, end: number) => ({ start, end });

describe("planWindow", () => {
  const cycle = (day: number, h: number): Session => ({ at: at(addDays(MON, day), h, 25), ms: 25 * MIN, full: true });
  it("finds the window from the last 90 days of focus", () => {
    const sessions = [...Array(12)].flatMap((_, w) => [cycle(-7 * w, 9), cycle(-7 * w + 1, 10)]);
    const tasks = new Map<string, Task>([["a", { id: "a", title: "A", sessions }]]);
    expect(planWindow(tasks, at(MON, 12))).toMatchObject({ from: 9, to: 11, days: "weekdays" });
  });
  it("stays quiet with too little history", () => {
    const tasks = new Map<string, Task>([["a", { id: "a", title: "A", sessions: [cycle(0, 9), cycle(1, 9)] }]]);
    expect(planWindow(tasks, at(MON, 12))).toBeNull();
  });
});

describe("windowOn", () => {
  it("gives today's window while it is ahead or under way", () => {
    expect(windowOn(win(9, 11), at(MON, 7))).toEqual(span(at(MON, 9), at(MON, 11)));
    expect(windowOn(win(9, 11), at(MON, 10, 30))).toEqual(span(at(MON, 9), at(MON, 11)));
  });
  it("is gone once the window has passed", () => {
    expect(windowOn(win(9, 11), at(MON, 11))).toBeNull();
  });
  it("keeps weekday windows off weekends and the other way round", () => {
    expect(windowOn(win(9, 11, "weekdays"), at(SAT, 8))).toBeNull();
    expect(windowOn(win(9, 11, "weekends"), at(MON, 8))).toBeNull();
    expect(windowOn(win(9, 11, "weekends"), at(SAT, 8))).not.toBeNull();
    expect(windowOn(win(9, 11, 2), at(SAT, 8))).not.toBeNull();
  });
  it("follows a night window past midnight", () => {
    const night = win(22, 25);
    expect(windowOn(night, at(MON, 20))).toEqual(span(at(MON, 22), at(addDays(MON, 1), 1)));
    expect(windowOn(night, at(addDays(MON, 1), 0, 30))).toEqual(span(at(MON, 22), at(addDays(MON, 1), 1)));
  });
  it("judges a night window by the evening it started", () => {
    expect(windowOn(win(22, 25, "weekdays"), at(SAT, 0, 30))).toEqual(span(at(addDays(SAT, -1), 22), at(SAT, 1)));
  });
});

describe("overlap and inWindow", () => {
  const w = span(at(MON, 9), at(MON, 11));
  it("measures the shared time", () => {
    expect(overlap(span(at(MON, 8), at(MON, 10)), w)).toBe(HOUR);
    expect(overlap(span(at(MON, 12), at(MON, 13)), w)).toBe(0);
  });
  it("counts a task that is mostly inside, or that covers most of the window", () => {
    expect(inWindow(span(at(MON, 10, 30), at(MON, 11, 20)), w)).toBe(true);
    expect(inWindow(span(at(MON, 10, 40), at(MON, 11, 40)), w)).toBe(false);
    expect(inWindow(span(at(MON, 8), at(MON, 13)), w)).toBe(true);
  });
});

describe("bestSlot", () => {
  const w = span(at(MON, 9), at(MON, 11)), gain = 12.5 * MIN;
  // A two-hour task placed first, second or third in a list that starts at 8:00.
  const spans = [span(at(MON, 8), at(MON, 10)), span(at(MON, 9), at(MON, 11)), span(at(MON, 10), at(MON, 12))];
  it("moves a task to where most of it lands in the window", () => {
    expect(bestSlot(spans, w, 2, gain)).toBe(1);
    expect(bestSlot(spans, w, 0, gain)).toBe(1);
  });
  it("leaves a task that is already there", () => {
    expect(bestSlot(spans, w, 1, gain)).toBe(-1);
  });
  it("only moves for a real gain", () => {
    const close = [span(at(MON, 9, 5), at(MON, 11, 5)), span(at(MON, 9, 0), at(MON, 11))];
    expect(bestSlot(close, w, 0, gain)).toBe(-1);
  });
  it("prefers starting right at the window when two places fit equally", () => {
    const wide = span(at(MON, 9), at(MON, 13));
    const two = [span(at(MON, 11), at(MON, 12)), span(at(MON, 9, 30), at(MON, 10, 30)), span(at(MON, 13), at(MON, 14))];
    expect(bestSlot(two, wide, 2, gain)).toBe(1);
  });
});
