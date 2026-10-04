import { describe, expect, it } from "vitest";
import { endedInStep, hueOf, initials, inStep, nextRound, phaseAt, sortRooms, type Listed } from "./rhythm";

const MIN = 60000, hour = Date.UTC(2026, 9, 4, 14);
const room = (title: string, n: number, house = false, max = 12): Listed => ({ code: title, title, rhythm: "25/5", house, max, names: Array.from({ length: n }, (_, i) => "p" + i) });

describe("phaseAt", () => {
  it("starts 25/5 rounds on the hour and the half hour", () => {
    expect(phaseAt("25/5", hour + 3 * MIN)).toEqual({ focus: true, start: hour, end: hour + 25 * MIN });
    expect(phaseAt("25/5", hour + 27 * MIN)).toEqual({ focus: false, start: hour + 25 * MIN, end: hour + 30 * MIN });
    expect(phaseAt("25/5", hour + 31 * MIN)).toEqual({ focus: true, start: hour + 30 * MIN, end: hour + 55 * MIN });
  });
  it("starts 50/10 rounds on the hour", () => {
    expect(phaseAt("50/10", hour + 49 * MIN).end).toBe(hour + 50 * MIN);
    expect(phaseAt("50/10", hour + 50 * MIN)).toEqual({ focus: false, start: hour + 50 * MIN, end: hour + 60 * MIN });
  });
});

describe("nextRound", () => {
  it("is the current round while it's focus time, else the end of the break", () => {
    expect(nextRound("25/5", hour + 10 * MIN)).toBe(hour);
    expect(nextRound("50/10", hour + 55 * MIN)).toBe(hour + 60 * MIN);
  });
});

describe("inStep", () => {
  const at = hour + 10 * MIN;
  it("holds for a running timer of the same kind ending with the phase", () => {
    expect(inStep("25/5", { mode: "focus", status: "running", endsAt: hour + 25 * MIN + 800 }, at)).toBe(true);
  });
  it("fails when paused, drifted, or on a break during focus", () => {
    expect(inStep("25/5", { mode: "focus", status: "paused", endsAt: hour + 25 * MIN }, at)).toBe(false);
    expect(inStep("25/5", { mode: "focus", status: "running", endsAt: hour + 26 * MIN }, at)).toBe(false);
    expect(inStep("25/5", { mode: "short", status: "running", endsAt: hour + 25 * MIN }, at)).toBe(false);
  });
});

describe("endedInStep", () => {
  it("accepts a focus that ended with the room's focus, a little early or late", () => {
    expect(endedInStep("25/5", "focus", hour + 25 * MIN - 1500)).toBe(true);
    expect(endedInStep("25/5", "focus", hour + 25 * MIN + 1500)).toBe(true);
  });
  it("rejects other end times and the wrong kind of phase", () => {
    expect(endedInStep("25/5", "focus", hour + 24 * MIN)).toBe(false);
    expect(endedInStep("25/5", "short", hour + 25 * MIN)).toBe(false);
    expect(endedInStep("25/5", "short", hour + 30 * MIN)).toBe(true);
  });
});

describe("sortRooms", () => {
  it("puts busy rooms first, full rooms last, and house rooms ahead on a tie", () => {
    const rooms = [room("quiet", 1), room("full", 12), room("busy", 5), room("House", 1, true), room("pair", 2, false, 2)];
    expect(sortRooms(rooms).map((r) => r.title)).toEqual(["busy", "House", "quiet", "full", "pair"]);
  });
});

describe("initials", () => {
  it("takes the first and last word, or two letters of one word", () => {
    expect(initials("ana maria lopez")).toBe("AL");
    expect(initials("ben")).toBe("BE");
    expect(initials("  ")).toBe("?");
  });
});

describe("hueOf", () => {
  it("is stable and ignores case", () => {
    expect(hueOf("Ana")).toBe(hueOf("ana"));
    expect(hueOf("Ana")).toBeGreaterThanOrEqual(0);
    expect(hueOf("Ana")).toBeLessThan(360);
  });
});
