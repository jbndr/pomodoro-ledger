import { describe, expect, it } from "vitest";
import { busySpans, checkSession, handSession, MAX_HAND, parseLength, suggestStart } from "./manual";
import type { Task } from "./tasks";

const DAY = new Date(2026, 9, 12).getTime(), MIN = 60000, HOUR = 60 * MIN;
const at = (h: number, m = 0) => DAY + h * HOUR + m * MIN;

describe("parseLength", () => {
  it("reads minutes, hours and both", () => {
    expect(parseLength("25")).toBe(25 * MIN);
    expect(parseLength(" 25m ")).toBe(25 * MIN);
    expect(parseLength("90 min")).toBe(90 * MIN);
    expect(parseLength("1h")).toBe(HOUR);
    expect(parseLength("1h 30m")).toBe(90 * MIN);
    expect(parseLength("1h30")).toBe(90 * MIN);
    expect(parseLength("2 hours 5 minutes")).toBe(125 * MIN);
    expect(parseLength("1.5h")).toBe(90 * MIN);
    expect(parseLength("1,25h")).toBe(75 * MIN);
    expect(parseLength("1:30")).toBe(90 * MIN);
  });
  it("turns down anything else", () => {
    for (const s of ["", "abc", "1:75", "h", "m", "-5", "1.5"]) expect(parseLength(s)).toBeNull();
  });
});

describe("handSession", () => {
  const F = 25 * MIN;
  it("ends after its length and counts whole cycles", () => {
    expect(handSession(at(9), 50 * MIN, F)).toEqual({ at: at(9, 50), ms: 50 * MIN, hand: true, full: true, cycles: 2 });
    expect(handSession(at(9), 40 * MIN, F)).toEqual({ at: at(9, 40), ms: 40 * MIN, hand: true, full: true });
    expect(handSession(at(9), 20 * MIN, F)).toEqual({ at: at(9, 20), ms: 20 * MIN, hand: true });
  });
  it("keeps a corrected session's label and run, and recounts its cycles", () => {
    const flow = { at: at(13), ms: 3 * HOUR, project: "Docs", run: "fl-abc" };
    expect(handSession(at(10), HOUR, F, flow)).toEqual({ at: at(11), ms: HOUR, project: "Docs", run: "fl-abc", hand: true, full: true, cycles: 2 });
    expect(handSession(at(9), 10 * MIN, F, { at: at(9, 25), ms: F, full: true, run: "x" })).toEqual({ at: at(9, 10), ms: 10 * MIN, run: "x", hand: true });
  });
});

describe("busySpans", () => {
  const tasks = new Map<string, Task>([
    ["a", { id: "a", title: "Write", sessions: [{ at: at(9, 25), ms: 25 * MIN, full: true }, { at: at(10), ms: 0 }, { at: at(11), ms: 20 * MIN, hand: true }] }],
    ["u", { id: "u", title: "x", system: true, sessions: [{ at: at(14), ms: 30 * MIN }] }],
  ]);
  it("lists each session's span, skipping one being changed", () => {
    expect(busySpans(tasks)).toEqual([
      { key: "a:0", from: at(9), to: at(9, 25), title: "Write" },
      { key: "a:2", from: at(10, 40), to: at(11), title: "Write" },
      { key: "u:0", from: at(13, 30), to: at(14), title: "Unplanned focus" },
    ]);
    expect(busySpans(tasks, "a:2").map((b) => b.key)).toEqual(["a:0", "u:0"]);
  });
});

describe("checkSession", () => {
  const busy = [{ key: "a:0", from: at(9), to: at(9, 25), title: "Write" }, { key: "a:1", from: at(10), to: at(10, 25), title: "Write" }];
  const now = at(12);
  it("accepts a session that fits", () => {
    expect(checkSession(at(9, 25), 35 * MIN, busy, now)).toBeNull();
    expect(checkSession(at(11), HOUR, busy, now)).toBeNull();
  });
  it("lets sessions touch within a minute", () => {
    expect(checkSession(at(9, 24), 36 * MIN + 30_000, busy, now)).toBeNull();
  });
  it("names the first session it overlaps", () => {
    expect(checkSession(at(8, 50), 2 * HOUR, busy, now)).toEqual({ kind: "overlap", with: busy[0] });
    expect(checkSession(at(10, 10), 5 * MIN, busy, now)).toEqual({ kind: "overlap", with: busy[1] });
  });
  it("turns down the future and odd lengths", () => {
    expect(checkSession(at(11, 50), 15 * MIN, busy, now)).toEqual({ kind: "future" });
    expect(checkSession(at(11), 30_000, busy, now)).toEqual({ kind: "short" });
    expect(checkSession(at(-14), MAX_HAND + MIN, [], now)).toEqual({ kind: "long" });
    expect(checkSession(at(-1), MAX_HAND, [], now)).toBeNull();
  });
});

describe("suggestStart", () => {
  it("ends on the last five minutes before now", () => {
    expect(suggestStart([], 25 * MIN, at(14, 7))).toBe(at(13, 40));
  });
  it("steps back before sessions it would overlap", () => {
    const busy = [{ key: "a:0", from: at(13, 30), to: at(13, 55), title: "Write" }, { key: "a:1", from: at(13, 0), to: at(13, 20), title: "Write" }];
    expect(suggestStart(busy, 25 * MIN, at(14, 2))).toBe(at(12, 35));
    expect(suggestStart(busy, 10 * MIN, at(14, 2))).toBe(at(13, 20));
  });
});
